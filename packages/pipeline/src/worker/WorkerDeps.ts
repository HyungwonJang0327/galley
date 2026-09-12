// runOnce가 바깥과 닿는 면 전부. **비결정성을 여기로 민다** — runOnce 안에서 Date.now()·
// randomUUID를 직접 부르지 않는다. 그래야 heartbeat 만료·타임아웃을 실제 시간을 흘리지 않고
// 테스트한다(decisions/run-execution-model.md "루프는 runOnce(deps)").
import type { StepName, StepStatus } from '../run/stateMachine.ts';
import type { StepRunner } from '../steps/StepRunner.ts';

export interface Clock {
  now(): Date;
}

export interface Ids {
  next(): string;
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** 워커가 잡은 실행 하나. 단계는 `nextAction`이 보는 최소 형태로만 들고 온다. */
export interface ClaimedRun {
  id: string;
  topicId: string;
  topicTitle: string;
  topicSlug: string;
  modelId: string;
  /** 사람이 준 수정 지시(재실행일 때만). */
  instruction?: string;
  steps: { name: StepName; status: StepStatus; origin?: 'fresh' | 'carried' }[];
}

export interface StepOutcome {
  status: StepStatus;
  attemptCount: number;
  errorCode?: string;
  errorMessage?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationMs?: number;
}

/**
 * 워커가 DB에 닿는 면. **워커는 Prisma를 직접 알지 않는다** — 테스트가 가짜 repo로 갈아끼우고,
 * 나중에 저장소가 바뀌어도 루프는 그대로다.
 */
export interface WorkerRepo {
  /** heartbeat가 끊긴 running 실행을 interrupted로 돌린다. 회수한 개수를 준다. */
  reclaimStale(before: Date): Promise<number>;
  /**
   * 돌 실행 하나를 준다(동시 1개). 없으면 null.
   * `justClaimed`는 **이번에 queued·interrupted에서 running으로 바꿨는지** — 이미 이 워커가
   * 잡아 두고 이어서 도는 경우와 구분한다. 잡은 틱은 거기서 끝내 승인·취소가 끼어들 틈을 준다.
   */
  claimRun(workerId: string, now: Date): Promise<{ run: ClaimedRun; justClaimed: boolean } | null>;
  /** 살아 있음을 알린다. */
  beat(runId: string, now: Date): Promise<void>;
  /** 단계를 실행 중으로 표시하고 시도 횟수를 올린다. */
  startStep(runId: string, step: StepName, now: Date): Promise<void>;
  /** 단계 결과를 기록한다. 성공이면 실패 기록을 비운다. */
  finishStep(runId: string, step: StepName, outcome: StepOutcome, now: Date): Promise<void>;
  /** 6단계가 끝났다 — 승인 대기로. */
  awaitApproval(runId: string, now: Date): Promise<void>;
  /** 단계가 영구 실패했다 — 실행을 실패로. */
  failRun(runId: string, now: Date): Promise<void>;
}

export interface WorkerDeps {
  /**
   * 이 워커 **프로세스**의 정체성. 기동할 때 한 번 만들고(`ids.next()`) 끝까지 같은 값을 쓴다 —
   * 틱마다 새로 만들면 앞 틱에 잡아 둔 실행을 자기 것으로 알아보지 못한다.
   */
  workerId: string;
  clock: Clock;
  /** 워커 id·그 밖의 식별자 생성. 기동 시 한 번 쓰인다. */
  ids: Ids;
  logger: Logger;
  repo: WorkerRepo;
  stepRunner: StepRunner;
}
