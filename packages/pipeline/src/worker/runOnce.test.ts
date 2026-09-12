// 워커 틱 테스트. tick을 직접 여러 번 불러 상태 변화를 본다 — 타이머도 실제 DB도 없다.
// 비결정성(시각·id)은 deps로 들어오므로 clock을 앞으로 돌려 heartbeat 만료를 만든다.
import { describe, it, expect, vi } from 'vitest';
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_STEP_ATTEMPTS,
  STEP_TIMEOUT_MS,
  runOnce,
} from './runOnce.ts';
import { createMockStepRunner } from '../steps/MockStepRunner.ts';
import type { StepContext, StepResult, StepRunner } from '../steps/StepRunner.ts';
import { STEP_ORDER, STEP_STATUS, type StepName } from '../run/stateMachine.ts';
import type { ClaimedRun, StepOutcome, Timers, WorkerDeps, WorkerRepo } from './WorkerDeps.ts';

/**
 * 손으로 발화시키는 타이머. 실제 시간은 흐르지 않는다 — 테스트가 `fireEvery`/`fireAfter`로
 * 원하는 순간에 박동·타임아웃을 일으킨다.
 */
function fakeTimers() {
  const everies: { ms: number; fn: () => void; stopped: boolean }[] = [];
  const afters: { ms: number; fn: () => void; cancelled: boolean }[] = [];
  const timers: Timers = {
    every(ms, fn) {
      const entry = { ms, fn, stopped: false };
      everies.push(entry);
      return () => {
        entry.stopped = true;
      };
    },
    after(ms, fn) {
      const entry = { ms, fn, cancelled: false };
      afters.push(entry);
      return () => {
        entry.cancelled = true;
      };
    },
  };
  return {
    timers,
    everies,
    afters,
    /** 살아 있는 반복 타이머를 전부 한 번 발화. */
    fireEvery() {
      for (const e of everies) if (!e.stopped) e.fn();
    },
    /** 아직 취소되지 않은 일회 타이머를 전부 발화(각각 한 번만). */
    fireAfter() {
      for (const a of afters) {
        if (a.cancelled) continue;
        a.cancelled = true;
        a.fn();
      }
    },
  };
}

/**
 * 호출될 때마다 `nextCall()`이 깨어나고, 테스트가 `release()`·타임아웃으로 끝낼 때까지 끝나지
 * 않는 StepRunner — 단계 도중의 시간을 만든다. 마이크로태스크 개수를 세지 않고 "구현이 불렸다"는
 * 순간을 기다리므로 runOnce 내부 await 개수가 바뀌어도 테스트가 흔들리지 않는다.
 */
function blockingRunner(options: { onAbort?: 'reason' | 'ownAbortError' } = {}) {
  const calls: StepContext[] = [];
  let resolveCurrent: ((r: StepResult) => void) | null = null;
  let waiters: ((ctx: StepContext) => void)[] = [];
  const runner: StepRunner = {
    run(ctx) {
      calls.push(ctx);
      const pending = waiters;
      waiters = [];
      for (const w of pending) w(ctx);
      return new Promise<StepResult>((resolve, reject) => {
        resolveCurrent = resolve;
        ctx.signal.addEventListener(
          'abort',
          () =>
            reject(
              options.onAbort === 'ownAbortError'
                ? new DOMException('중단', 'AbortError')
                : ctx.signal.reason,
            ),
          { once: true },
        );
      });
    },
  };
  return {
    runner,
    calls,
    nextCall: () => new Promise<StepContext>((resolve) => waiters.push(resolve)),
    release(result: StepResult = { artifacts: {} }) {
      resolveCurrent?.(result);
      resolveCurrent = null;
    },
  };
}

/** 손으로 옮기는 시계. `advance`로 원하는 만큼 시간을 흘린다. */
function fakeClock(start = new Date('2026-09-13T00:00:00Z')) {
  let current = start;
  return {
    now: () => current,
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

/** 실행 하나를 들고 있는 가짜 저장소. 단계 상태를 메모리에서 옮긴다. */
function fakeRepo(options: { pendingApproval?: boolean } = {}) {
  const steps = STEP_ORDER.map((name) => ({ name, status: STEP_STATUS.pending as string }));
  const state = {
    steps,
    claimed: false,
    beats: [] as Date[],
    outcomes: [] as { step: StepName; outcome: StepOutcome }[],
    awaited: false,
    failed: false,
    staleBefore: null as Date | null,
    reclaim: 0,
  };

  const run: ClaimedRun = {
    id: 'run_1',
    topicId: 't1',
    topicTitle: '무한 스크롤',
    topicSlug: '무한-스크롤',
    modelId: 'mock',
    steps: steps as ClaimedRun['steps'],
  };

  const repo: WorkerRepo = {
    async reclaimStale(before) {
      state.staleBefore = before;
      const count = state.reclaim;
      state.reclaim = 0;
      return count;
    },
    async claimRun() {
      // 승인 대기 실행은 워커가 잡지 않는다(사람 차례다).
      if (options.pendingApproval === true) return null;
      const justClaimed = !state.claimed;
      state.claimed = true;
      return { run, justClaimed };
    },
    async beat(_runId, now) {
      state.beats.push(now);
    },
    async startStep(_runId, step) {
      const found = steps.find((s) => s.name === step);
      if (found) found.status = STEP_STATUS.running;
    },
    async finishStep(_runId, step, outcome) {
      const found = steps.find((s) => s.name === step);
      if (found) found.status = outcome.status;
      state.outcomes.push({ step, outcome });
    },
    async awaitApproval() {
      state.awaited = true;
    },
    async failRun() {
      state.failed = true;
    },
  };

  return { repo, state };
}

function deps(overrides: Partial<WorkerDeps> = {}): WorkerDeps & {
  clockRef: ReturnType<typeof fakeClock>;
  timersRef: ReturnType<typeof fakeTimers>;
} {
  const clock = fakeClock();
  const timers = fakeTimers();
  let n = 0;
  return {
    workerId: 'worker_1',
    clock,
    clockRef: clock,
    timersRef: timers,
    ids: { next: () => `id_${(n += 1)}` },
    timers: timers.timers,
    logger: { info: vi.fn(), error: vi.fn() },
    repo: fakeRepo().repo,
    stepRunner: createMockStepRunner(),
    ...overrides,
  };
}

describe('runOnce — 정상 진행', () => {
  it('잡은 틱과 단계를 도는 틱을 나눈다(그 사이에 승인·취소가 끼어들 수 있게)', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });

    const claiming = await runOnce(d);
    const first = await runOnce(d);

    expect(claiming).toEqual({ outcome: 'claimed' });
    expect(state.outcomes).toHaveLength(1);
    expect(first).toEqual({ outcome: 'completed', stepRef: { runId: 'run_1', step: 'evidence' } });
  });

  it('STEP_ORDER 순서대로 한 틱에 한 단계씩 돈다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });

    await runOnce(d); // 잡는 틱
    for (let i = 0; i < STEP_ORDER.length; i += 1) await runOnce(d);

    expect(state.outcomes.map((o) => o.step)).toEqual([...STEP_ORDER]);
    expect(state.outcomes.every((o) => o.outcome.status === STEP_STATUS.succeeded)).toBe(true);
  });

  it('6단계가 끝나면 승인 대기로 넘긴다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });
    await runOnce(d); // 잡는 틱
    for (let i = 0; i < STEP_ORDER.length; i += 1) await runOnce(d);

    const last = await runOnce(d);

    expect(state.awaited).toBe(true);
    expect(last).toEqual({ outcome: 'completed' });
  });

  it('모델 없는 단계는 토큰·비용을 기록하지 않는다(워커가 추정하지 않는다)', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });
    await runOnce(d); // 잡는 틱
    for (let i = 0; i < STEP_ORDER.length; i += 1) await runOnce(d);

    const publishInfo = state.outcomes.find((o) => o.step === 'publishInfo');
    const velog = state.outcomes.find((o) => o.step === 'velog');

    expect(publishInfo?.outcome.modelId).toBeUndefined();
    expect(publishInfo?.outcome.inputTokens).toBeUndefined();
    expect(velog?.outcome.modelId).toBe('mock');
  });
});

describe('runOnce — 승인 대기', () => {
  it('여러 번 불러도 아무것도 잡지 않는다(사람 차례다)', async () => {
    const { repo, state } = fakeRepo({ pendingApproval: true });
    const d = deps({ repo });

    const results = [await runOnce(d), await runOnce(d), await runOnce(d)];

    expect(results.every((r) => r.outcome === 'idle')).toBe(true);
    expect(state.outcomes).toEqual([]);
    expect(state.awaited).toBe(false);
  });
});

describe('runOnce — 중단 회수', () => {
  it('heartbeat가 타임아웃만큼 끊긴 실행을 회수한다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });
    state.reclaim = 1;

    const result = await runOnce(d);

    expect(result).toEqual({ outcome: 'recovered' });
    // 회수 기준 시각 = 지금 - 타임아웃. clock을 옮기면 기준도 함께 움직인다.
    expect(state.staleBefore?.getTime()).toBe(d.clock.now().getTime() - HEARTBEAT_TIMEOUT_MS);
  });

  it('시계를 앞으로 돌리면 회수 기준도 따라간다(실제 시간을 흘리지 않는다)', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });
    const before = d.clock.now().getTime();

    d.clockRef.advance(5 * 60_000);
    await runOnce(d);

    expect(state.staleBefore!.getTime()).toBe(before + 5 * 60_000 - HEARTBEAT_TIMEOUT_MS);
  });

  it('회수한 틱은 거기서 끝낸다(같은 틱에 단계까지 돌지 않는다)', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });
    state.reclaim = 2;

    await runOnce(d);

    expect(state.outcomes).toEqual([]);
  });
});

describe('runOnce — 실패', () => {
  it('재시도 가능한 실패는 다시 해보고 성공하면 그 시도 횟수를 남긴다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({
      repo,
      stepRunner: createMockStepRunner({
        failAt: { step: 'evidence', code: 'RATE_LIMITED', retryable: true },
        failTimes: 2,
      }),
    });
    await runOnce(d); // 잡는 틱

    const result = await runOnce(d);

    expect(result.outcome).toBe('completed');
    expect(state.outcomes[0]?.outcome).toMatchObject({
      status: STEP_STATUS.succeeded,
      attemptCount: 3,
    });
    // 성공 결과에는 실패 정보가 실리지 않는다(저장 계층이 컬럼을 비울 수 있게).
    expect(state.outcomes[0]?.outcome.errorCode).toBeUndefined();
    expect(state.outcomes[0]?.outcome.errorMessage).toBeUndefined();
  });

  it('계속 실패하면 상한에서 멈추고 마지막 실패만 남긴다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({
      repo,
      stepRunner: createMockStepRunner({
        failAt: { step: 'evidence', code: 'TIMEOUT', message: '응답이 없습니다.', retryable: true },
      }),
    });
    await runOnce(d); // 잡는 틱

    const result = await runOnce(d);

    expect(result).toEqual({ outcome: 'failed', stepRef: { runId: 'run_1', step: 'evidence' } });
    expect(state.outcomes).toHaveLength(1);
    expect(state.outcomes[0]?.outcome).toMatchObject({
      status: STEP_STATUS.failed,
      attemptCount: MAX_STEP_ATTEMPTS,
      errorCode: 'TIMEOUT',
      errorMessage: '응답이 없습니다.',
    });
    expect(state.failed).toBe(true);
  });

  it('영구 실패는 한 번만 해보고 바로 실패로 기록한다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({
      repo,
      stepRunner: createMockStepRunner({
        failAt: { step: 'evidence', code: 'MODEL_REFUSED', retryable: false },
      }),
    });
    await runOnce(d); // 잡는 틱

    await runOnce(d);

    expect(state.outcomes[0]?.outcome).toMatchObject({
      status: STEP_STATUS.failed,
      attemptCount: 1,
      errorCode: 'MODEL_REFUSED',
    });
  });

  it('실패한 단계가 남아 있으면 다음 틱이 실행을 실패로 돌린다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({
      repo,
      stepRunner: createMockStepRunner({
        failAt: { step: 'evidence', code: 'MODEL_REFUSED', retryable: false },
      }),
    });
    await runOnce(d); // 잡는 틱
    await runOnce(d);
    state.failed = false;

    const result = await runOnce(d);

    expect(result).toEqual({ outcome: 'failed', stepRef: { runId: 'run_1', step: 'evidence' } });
    expect(state.failed).toBe(true);
  });
});

describe('runOnce — heartbeat', () => {
  it('단계를 돌 때마다 살아 있음을 알린다', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({ repo });
    await runOnce(d); // 잡는 틱 — 잡자마자 한 번 알린다

    await runOnce(d);

    expect(state.beats).toHaveLength(2);
    expect(state.beats[1]).toEqual(d.clock.now());
  });

  it('재시도할 때마다 다시 알린다(긴 재시도 중에 중단으로 오해받지 않게)', async () => {
    const { repo, state } = fakeRepo();
    const d = deps({
      repo,
      stepRunner: createMockStepRunner({
        failAt: { step: 'evidence', code: 'TIMEOUT', retryable: true },
      }),
    });
    await runOnce(d); // 잡는 틱

    await runOnce(d);

    expect(state.beats).toHaveLength(MAX_STEP_ATTEMPTS + 1);
  });
});

describe('runOnce — 단계 도중 heartbeat', () => {
  it('단계가 도는 동안 5초 간격 타이머로 계속 알리고, 끝나면 멈춘다', async () => {
    const { repo, state } = fakeRepo();
    const blocking = blockingRunner();
    const d = deps({ repo, stepRunner: blocking.runner });
    await runOnce(d); // 잡는 틱(박동 1)

    const started = blocking.nextCall();
    const tick = runOnce(d);
    await started; // 시도 시작 박동 1 → 2. 이제 단계가 "오래" 돈다.
    expect(state.beats).toHaveLength(2);
    expect(d.timersRef.everies[0]?.ms).toBe(HEARTBEAT_INTERVAL_MS);

    d.clockRef.advance(HEARTBEAT_INTERVAL_MS);
    d.timersRef.fireEvery();
    d.clockRef.advance(HEARTBEAT_INTERVAL_MS);
    d.timersRef.fireEvery();
    await Promise.resolve();
    expect(state.beats).toHaveLength(4);
    expect(state.beats[3]).toEqual(d.clock.now());

    blocking.release();
    await tick;
    expect(d.timersRef.everies[0]?.stopped).toBe(true);
    // 멈춘 뒤 발화해도 더 쓰지 않는다.
    d.timersRef.fireEvery();
    await Promise.resolve();
    expect(state.beats).toHaveLength(4);
  });
});

describe('runOnce — 단계 타임아웃', () => {
  it('제한 시간을 넘긴 시도는 STEP_TIMEOUT(재시도 가능)으로 끊고 다시 해본다', async () => {
    const { repo, state } = fakeRepo();
    const blocking = blockingRunner();
    const d = deps({ repo, stepRunner: blocking.runner });
    await runOnce(d); // 잡는 틱

    const first = blocking.nextCall();
    const tick = runOnce(d);
    await first;
    expect(d.timersRef.afters[0]?.ms).toBe(STEP_TIMEOUT_MS);

    const second = blocking.nextCall();
    d.timersRef.fireAfter(); // 첫 시도 타임아웃
    await second; // 두 번째 시도가 시작됐다
    blocking.release();

    expect((await tick).outcome).toBe('completed');
    expect(state.outcomes[0]?.outcome).toMatchObject({
      status: STEP_STATUS.succeeded,
      attemptCount: 2,
    });
    expect(d.logger.error).toHaveBeenCalledWith(
      '단계 실패',
      expect.objectContaining({ code: 'STEP_TIMEOUT', retryable: true, attempt: 1 }),
    );
  });

  it('구현이 signal.reason 대신 자기 AbortError를 던져도 타임아웃으로 기록한다', async () => {
    const { repo } = fakeRepo();
    const blocking = blockingRunner({ onAbort: 'ownAbortError' });
    const d = deps({ repo, stepRunner: blocking.runner });
    await runOnce(d);

    let started = blocking.nextCall();
    const tick = runOnce(d);
    for (let attempt = 1; attempt <= MAX_STEP_ATTEMPTS; attempt += 1) {
      await started;
      started = blocking.nextCall();
      d.timersRef.fireAfter();
    }

    expect((await tick).outcome).toBe('failed');
    expect(d.logger.error).toHaveBeenCalledWith(
      '단계 실패',
      expect.objectContaining({ code: 'STEP_TIMEOUT', attempt: MAX_STEP_ATTEMPTS }),
    );
  });

  it('제때 끝나면 타임아웃 타이머를 취소한다', async () => {
    const d = deps();
    await runOnce(d);

    await runOnce(d);

    expect(d.timersRef.afters).toHaveLength(1);
    expect(d.timersRef.afters[0]?.cancelled).toBe(true);
  });
});
