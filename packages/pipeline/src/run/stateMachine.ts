// 단계 상태 머신 + 승인 게이트 — "지금 이 실행이 다음에 무엇을 해야 하는가"에만 답한다.
// DB·모델·파일을 모르는 순수 함수다. 답을 받아 실제로 DB를 쓰는 것은 워커(BW2)와 대시보드(BW4) 몫이고,
// 실행 상태(queued/running/interrupted)는 여기서 다루지 않는다(decisions/run-location.md — 분리).
//
// 요구사항 출처: decisions/evidence-collection.md "상태 머신(B1a) 인터페이스 요구사항" 6개.

/** 단계 6개, 순서 고정. 타임라인·워커·재실행 규칙이 전부 이 배열 하나를 읽는다(요구사항 1). */
export const STEP_ORDER = [
  'evidence',
  'velog',
  'verify',
  'linkedin',
  'zenn',
  'publishInfo',
] as const;

export type StepName = (typeof STEP_ORDER)[number];

/** 문자열이 단계 이름인지(HTTP 본문 등 밖에서 들어온 값 검증용). */
export function isStepName(value: string): value is StepName {
  return (STEP_ORDER as readonly string[]).includes(value);
}

/**
 * 검수 상태(사람이 보는 실행 상태). `Run.status`에 그대로 저장된다.
 * 값은 영어, 화면 한국어 라벨은 앱이 붙인다 — decisions/db-value-language.md.
 */
export const RUN_STATUS = {
  running: 'running',
  pendingApproval: 'pendingApproval',
  done: 'done',
  failed: 'failed',
} as const;

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

/** 단계 상태. `RunStep.status`에 그대로 저장된다. `skipped`는 재실행에서만 생긴다(요구사항 3). */
export const STEP_STATUS = {
  pending: 'pending',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  skipped: 'skipped',
} as const;

export type StepStatus = (typeof STEP_STATUS)[keyof typeof STEP_STATUS];

/** 한 단계의 현재 모습. `flags`는 화면 표시용이고 전이에 영향을 주지 않는다(요구사항 2). */
export interface StepState {
  name: StepName;
  status: StepStatus;
  flags?: { unsupported: number; uncertain: number };
}

export type NextAction =
  /** 이 단계를 돌려라. */
  | { kind: 'runStep'; step: StepName }
  /** 6단계가 다 끝났다 — 승인 대기로. */
  | { kind: 'awaitApproval' }
  /** 이 단계가 실패했다 — 실행을 실패로. */
  | { kind: 'fail'; step: StepName };

/**
 * 단계 목록을 보고 다음에 할 일을 고른다. 입력 순서는 믿지 않고 `STEP_ORDER`를 기준으로 본다.
 * 목록에 없는 단계는 `대기`로 친다. `실행 중`인 단계는 다시 돌릴 대상이다 — 단계는 원자적이라
 * 도중에 끊기면 그 단계 산출물을 버리고 처음부터 다시 돈다(decisions/run-location.md).
 */
export function nextAction(steps: readonly StepState[]): NextAction {
  const statusOf = new Map(steps.map((step) => [step.name, step.status]));

  const failed = STEP_ORDER.find((name) => statusOf.get(name) === STEP_STATUS.failed);
  if (failed) return { kind: 'fail', step: failed };

  const todo = STEP_ORDER.find((name) => {
    const status = statusOf.get(name) ?? STEP_STATUS.pending;
    return status === STEP_STATUS.pending || status === STEP_STATUS.running;
  });

  return todo ? { kind: 'runStep', step: todo } : { kind: 'awaitApproval' };
}

/** 이 단어가 수정 지시에 있으면 근거 수집까지 다시 돈다(요구사항 4). */
const EVIDENCE_KEYWORDS = ['근거', '커밋', '코드'] as const;

export interface RerunPlan {
  /** 다시 돌릴 단계(`STEP_ORDER` 순서). */
  steps: readonly StepName[];
  /** 이전 산출물을 유지한 채 `건너뜀`으로 표시할 단계(요구사항 3). */
  skipped: readonly StepName[];
}

/**
 * 재실행 범위 = (대상 단계, 수정 지시) → 다시 돌릴 단계들(요구사항 4).
 * 본문을 고치면 근거 검증도 자동으로 다시 돈다. 근거 수집은 기본 건너뛰고,
 * 대상으로 지정했거나 지시에 근거·커밋·코드가 있을 때만 포함한다.
 */
export function planRerun(target: StepName, instruction: string): RerunPlan {
  const steps = new Set<StepName>([target]);
  if (target === 'velog') steps.add('verify');
  if (EVIDENCE_KEYWORDS.some((keyword) => instruction.includes(keyword))) steps.add('evidence');

  return {
    steps: STEP_ORDER.filter((name) => steps.has(name)),
    skipped: steps.has('evidence') ? [] : ['evidence'],
  };
}

export type RunCommand =
  /** 사람이 승인 — 실행을 끝낸다. */
  | { type: 'approve' }
  /** 사람이 수정 지시 — 대상 단계부터 다시 돈다. */
  | { type: 'revise'; target: StepName; instruction: string };

/** 승인 대기가 아닌 실행에 승인·수정 지시가 온 경우(이미 끝났거나 아직 도는 중). */
export type CommandFailure = 'NOT_PENDING_APPROVAL';

export type CommandResult =
  { ok: true; status: RunStatus; rerun?: RerunPlan } | { ok: false; code: CommandFailure };

/**
 * 승인 게이트. 승인·수정 지시는 `승인 대기`에서만 받는다.
 * `flags`(근거 없음 수 등)는 보지 않는다 — unsupported가 있어도 승인할 수 있다(요구사항 5).
 * 던지지 않고 형태로 돌려준다(CLAUDE.md §4).
 */
export function applyCommand(status: RunStatus, command: RunCommand): CommandResult {
  if (status !== RUN_STATUS.pendingApproval) return { ok: false, code: 'NOT_PENDING_APPROVAL' };

  if (command.type === 'approve') return { ok: true, status: RUN_STATUS.done };

  return {
    ok: true,
    status: RUN_STATUS.running,
    rerun: planRerun(command.target, command.instruction),
  };
}
