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
  /**
   * 승인 대기에서 수정 지시를 받아 **새 시도로 넘어간** Run. 승인된 것(`done`)과 구분해야
   * "몇 번 만에 승인됐는가"가 남는다. 종결 상태라 `finishedAt`을 채운다(2026-09-13, BW4).
   */
  revised: 'revised',
} as const;

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS];

/** DB에서 읽은 문자열을 검수 상태로 좁힌다(스키마에 enum이 없다). */
export function isRunStatus(value: string): value is RunStatus {
  return (Object.values(RUN_STATUS) as readonly string[]).includes(value);
}

/** 단계 생명주기. `RunStep.status`에 그대로 저장된다. */
export const STEP_STATUS = {
  pending: 'pending',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
} as const;

export type StepStatus = (typeof STEP_STATUS)[keyof typeof STEP_STATUS];

/** DB에서 읽은 문자열을 단계 상태로 좁힌다(스키마에 enum이 없다). */
export function isStepStatus(value: string): value is StepStatus {
  return (Object.values(STEP_STATUS) as readonly string[]).includes(value);
}

/**
 * 단계 결과의 출처. `RunStep.origin`에 저장된다(요구사항 3).
 * - `fresh`: 이번 실행에서 다시 돈 단계. 첫 실행은 전부 fresh.
 * - `carried`: 시작 단계보다 앞이라 이번 재실행 범위에 없던 단계. 이전 실행 결과를 그대로 쓴다.
 *
 * **생명주기(`status`)와 직교한다** — 재실행 중 시작 단계가 실패하면 앞은 `carried`+`succeeded`,
 * 시작 단계는 `fresh`+`failed`, 뒤는 `pending`이다. 단일 enum으로는 표현할 수 없다.
 * 화면은 carried를 "이전 결과 · {원래 실행 시각}"으로 표시한다 — **"건너뜀"으로 쓰지 않는다**
 * (누락처럼 읽히지만 유효한 이전 결과다. decisions/layout.md).
 */
export const STEP_ORIGIN = {
  fresh: 'fresh',
  carried: 'carried',
} as const;

export type StepOrigin = (typeof STEP_ORIGIN)[keyof typeof STEP_ORIGIN];

/** 한 단계의 현재 모습. `flags`는 화면 표시용이고 전이에 영향을 주지 않는다(요구사항 2). */
export interface StepState {
  name: StepName;
  status: StepStatus;
  /** 생략하면 `fresh`(첫 실행). */
  origin?: StepOrigin;
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

/** 단계 지정이 없을 때, 이 단어가 지시에 있으면 근거 수집부터 다시 돈다. */
const EVIDENCE_KEYWORDS = ['근거', '커밋', '코드'] as const;

export interface RerunInput {
  /** 사용자가 단계 Select로 지정한 시작 단계. 지정이 텍스트 판단보다 우선한다. */
  startStep?: StepName;
  /** 수정 지시. 시작 단계 지정이 없을 때만 읽는다. */
  instruction: string;
}

/**
 * 수정 지시 길이 상한(글자 수). 지시는 `Run.instruction`에 원문 그대로 남고 프롬프트에 들어가므로
 * 끝없이 길면 안 된다. 미리보기·수정 지시 API가 같은 값으로 거절한다(`INSTRUCTION_TOO_LONG`).
 * 이 길이는 URL 쿼리에 안전하게 싣기 어려워 미리보기도 POST 본문으로 받는다.
 */
export const INSTRUCTION_MAX_LENGTH = 2000;

export interface RerunPlan {
  /** 이번 재실행이 시작하는 단계. */
  startStep: StepName;
  /** 이번에 다시 도는 단계 = 시작 단계와 그 뒤 전부(`STEP_ORDER` 순). */
  fresh: readonly StepName[];
  /** 범위 밖이라 이전 결과를 그대로 쓰는 앞 단계(`STEP_ORDER` 순). */
  carried: readonly StepName[];
}

/**
 * 재실행 범위 — **시작 단계와 그 뒤 전부**(decisions/evidence-collection.md 재실행 규칙).
 * 본문 입력은 EvidenceBundle뿐이고 링크드인·Zenn은 본문 파생, 발행정보 근거 목록도 같은 번들에서
 * 나온다. 앞만 다시 돌고 뒤를 두면 산출물이 서로 어긋난 채 남는다.
 *
 * `carried`까지 함께 돌려주는 것은 **재실행 확인 UI가 "다시 도는 단계"와 "이전 결과 유지"를 둘 다**
 * 보여주기 때문이다. 호출부가 시작 인덱스를 다시 다룰 일이 없도록 출처를 여기 하나로 둔다.
 * 그 이전 결과를 **누가 생산했는지**(`sourceRunId`)는 DB를 봐야 하므로 여기 없다 —
 * `resolveCarriedSources`(리포지토리)가 답한다.
 *
 * 첫 실행에는 태우지 않는다. `evidence`가 시작이면 `carried`가 비고, `publishInfo`만 돌면
 * `fresh`가 하나다 — 둘 다 규칙의 자연스러운 결과라 따로 분기하지 않는다.
 */
export function planRerun(input: RerunInput): RerunPlan {
  const startStep =
    input.startStep ??
    (EVIDENCE_KEYWORDS.some((keyword) => input.instruction.includes(keyword))
      ? 'evidence'
      : 'velog');
  const at = STEP_ORDER.indexOf(startStep);

  return { startStep, fresh: STEP_ORDER.slice(at), carried: STEP_ORDER.slice(0, at) };
}

export type RunCommand =
  /** 사람이 승인 — 실행을 끝낸다. */
  | { type: 'approve' }
  /** 사람이 수정 지시 — 이 Run은 `revised`로 끝나고 **새 Run**이 시작 단계부터 돈다. */
  | ({ type: 'revise' } & RerunInput);

/** 승인 대기가 아닌 실행에 승인·수정 지시가 온 경우(이미 끝났거나 아직 도는 중). */
export type CommandFailure = 'NOT_PENDING_APPROVAL';

/**
 * `status`는 **명령을 받은 그 Run**의 다음 상태다. `rerun`이 있으면 새 Run을 만들라는 지시 —
 * 재실행은 같은 Run의 재시도가 아니라 새 Run이다(decisions/run-execution-model.md §1).
 */
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
    status: RUN_STATUS.revised,
    rerun: planRerun({ startStep: command.startStep, instruction: command.instruction }),
  };
}
