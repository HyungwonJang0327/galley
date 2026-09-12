// 워커의 한 틱. **한 tick = 한 단계**만 처리한다 — 여러 단계를 이어 물면 승인·취소·heartbeat가
// 그 사이에 끼어들 수 없다. bin/worker.ts는 이걸 반복해서 부르는 껍데기일 뿐이다.
// (decisions/run-execution-model.md)
import { STEP_STATUS, nextAction, type StepName } from '../run/stateMachine.ts';
import { StepFailure, toStepFailure } from '../steps/StepRunner.ts';
import type { ClaimedRun, StepOutcome, WorkerDeps } from './WorkerDeps.ts';

/** heartbeat가 이만큼 끊기면 중단으로 본다(decisions/run-location.md). */
export const HEARTBEAT_TIMEOUT_MS = 30_000;

/**
 * 단계를 도는 동안 이 간격으로 heartbeat를 쓴다(decisions/run-location.md "heartbeat 쓰기 5s").
 * 시도 시작에만 쓰면 30초 넘게 걸리는 실제 모델 단계는 돌고 있는데도 중단으로 회수된다.
 *
 * **워커의 타이머로 쓴다, StepRunner 협조에 기대지 않는다** — 구현이 `beat()`를 빼먹는 순간
 * 그 단계는 조용히 회수된다(decisions/run-location.md 함정).
 */
export const HEARTBEAT_INTERVAL_MS = 5_000;

/**
 * 단계 하나의 최대 실행 시간. **heartbeat와 별개다** — heartbeat는 "프로세스가 살아 있다"만
 * 증명하고 단계가 실제로 진척 중인지는 모른다. 멈춘 모델 호출을 잡는 건 이 타임아웃이다.
 * 넘기면 `STEP_TIMEOUT`(재시도 가능)으로 그 시도를 끊는다.
 */
export const STEP_TIMEOUT_MS = 10 * 60_000;

/** 재시도 가능한 실패를 한 단계에서 몇 번까지 다시 해보는가. 정책은 워커가 정한다. */
export const MAX_STEP_ATTEMPTS = 3;

export type TickOutcome =
  /** 할 일이 없었다 — 껍데기는 잠시 쉰다. */
  | 'idle'
  /** 실행을 잡았다(이번 틱은 여기까지). */
  | 'claimed'
  /** 단계 하나를 끝냈다. */
  | 'completed'
  /** 단계가 영구 실패해 실행을 실패로 돌렸다. */
  | 'failed'
  /** 끊긴 실행을 회수했다. */
  | 'recovered';

export interface TickResult {
  outcome: TickOutcome;
  /** 이번 틱이 건드린 단계(있을 때만). 테스트가 DB를 뒤지지 않고 1차 검증한다. */
  stepRef?: { runId: string; step: StepName };
}

/**
 * 한 번 돈다. 순서: **끊긴 실행 회수 → 실행 잡기 → 다음 단계 하나 실행**.
 *
 * 잡은 직후에는 단계를 돌리지 않고 `claimed`로 끝낸다 — 잡는 것과 도는 것을 다른 틱으로 나눠야
 * 그 사이에 승인·취소가 끼어들 수 있고, 테스트도 단계 단위로 본다.
 */
export async function runOnce(deps: WorkerDeps, signal?: AbortSignal): Promise<TickResult> {
  const now = deps.clock.now();

  const reclaimed = await deps.repo.reclaimStale(new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS));
  if (reclaimed > 0) {
    deps.logger.info('끊긴 실행을 회수했다', { count: reclaimed });
    return { outcome: 'recovered' };
  }

  const claimed = await deps.repo.claimRun(deps.workerId, now);
  if (claimed === null) return { outcome: 'idle' };

  const { run } = claimed;
  if (claimed.justClaimed) {
    await deps.repo.beat(run.id, now);
    deps.logger.info('실행을 잡았다', { runId: run.id, workerId: deps.workerId });
    return { outcome: 'claimed' };
  }

  const action = nextAction(run.steps);

  if (action.kind === 'awaitApproval') {
    await deps.repo.awaitApproval(run.id, now);
    deps.logger.info('6단계를 마쳐 승인 대기로', { runId: run.id });
    return { outcome: 'completed' };
  }

  if (action.kind === 'fail') {
    await deps.repo.failRun(run.id, now);
    deps.logger.error('단계 실패로 실행을 실패로', { runId: run.id, step: action.step });
    return { outcome: 'failed', stepRef: { runId: run.id, step: action.step } };
  }

  return runStep(deps, run, action.step, signal);
}

async function runStep(
  deps: WorkerDeps,
  run: ClaimedRun,
  step: StepName,
  signal?: AbortSignal,
): Promise<TickResult> {
  const stepRef = { runId: run.id, step };
  await deps.repo.startStep(run.id, step, deps.clock.now());

  // 단계가 도는 동안 살아 있음을 계속 알린다. 쓰기 실패는 로그만 — 다음 박동이 다시 쓴다.
  const stopHeartbeat = deps.timers.every(HEARTBEAT_INTERVAL_MS, () => {
    deps.repo.beat(run.id, deps.clock.now()).catch((error: unknown) => {
      deps.logger.error('heartbeat 쓰기 실패', {
        ...stepRef,
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  });
  try {
    return await attemptStep(deps, run, step, signal);
  } finally {
    stopHeartbeat();
  }
}

async function attemptStep(
  deps: WorkerDeps,
  run: ClaimedRun,
  step: StepName,
  signal?: AbortSignal,
): Promise<TickResult> {
  const stepRef = { runId: run.id, step };

  for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt += 1) {
    const startedAt = deps.clock.now();
    await deps.repo.beat(run.id, startedAt);

    // 시도마다 새 signal — 바깥 종료 신호와 단계 타임아웃 둘 중 먼저 오는 쪽이 끊는다.
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const cancelTimeout = deps.timers.after(STEP_TIMEOUT_MS, () => {
      timedOut = true;
      controller.abort(
        new StepFailure('STEP_TIMEOUT', '단계가 제한 시간 안에 끝나지 않았습니다.', true),
      );
    });

    try {
      const result = await deps.stepRunner.run({
        runId: run.id,
        step,
        topic: { id: run.topicId, title: run.topicTitle, slug: run.topicSlug },
        instruction: run.instruction,
        signal: controller.signal,
      });

      const finishedAt = deps.clock.now();
      const outcome: StepOutcome = {
        status: STEP_STATUS.succeeded,
        attemptCount: attempt,
        modelId: result.model,
        inputTokens: result.tokens?.input,
        outputTokens: result.tokens?.output,
        costUsd: result.costUsd,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      };
      await deps.repo.finishStep(run.id, step, outcome, finishedAt);
      deps.logger.info('단계 완료', { ...stepRef, attempt });
      return { outcome: 'completed', stepRef };
    } catch (error) {
      // 구현이 signal.reason을 던지든 자기 AbortError를 던지든, 타임아웃이면 타임아웃으로 기록한다.
      const failure = timedOut
        ? new StepFailure('STEP_TIMEOUT', '단계가 제한 시간 안에 끝나지 않았습니다.', true)
        : toStepFailure(error);
      const last = attempt === MAX_STEP_ATTEMPTS || !failure.retryable;
      deps.logger.error('단계 실패', {
        ...stepRef,
        attempt,
        code: failure.code,
        retryable: failure.retryable,
        // 스택·원본은 로그에만 — 행에는 코드와 한 줄만 남긴다(error-handling.md).
        detail: failure.stack,
      });

      if (!last) continue;

      const finishedAt = deps.clock.now();
      await deps.repo.finishStep(
        run.id,
        step,
        {
          status: STEP_STATUS.failed,
          attemptCount: attempt,
          errorCode: failure.code,
          errorMessage: failure.message,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
        },
        finishedAt,
      );
      await deps.repo.failRun(run.id, finishedAt);
      return { outcome: 'failed', stepRef };
    } finally {
      cancelTimeout();
      signal?.removeEventListener('abort', onAbort);
    }
  }

  // MAX_STEP_ATTEMPTS가 0 이하가 아니면 닿지 않는다.
  return { outcome: 'failed', stepRef };
}
