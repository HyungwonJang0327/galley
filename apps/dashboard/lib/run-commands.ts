// 승인·수정 지시·재실행 미리보기(서버 전용): pipeline이 Run 상태를 바꾸고, 실제 재실행은 워커가
// 집어간다 — decisions/run-location.md. 실패는 던지지 않고 { ok: false, error } 형태로 돌려주며,
// 코드 → 한국어 문구는 여기(앱 어댑터)에서 붙인다(decisions/error-handling.md ②).
import {
  approveRun,
  createModelRegistryFromEnv,
  previewRerun,
  prisma,
  reviseRun,
  type ApproveRunFailure,
  type PreviewRerunFailure,
  type RerunPreview,
  type ReviseRunFailure,
  type StepName,
} from '@galley/pipeline';
import type { StartedRun } from './run-start';

/** 화면·API가 그대로 쓰는 직렬화 형태. `StartedRun`에 종결 시각을 더한 것. */
export interface RunRecord extends StartedRun {
  finishedAt: string | null;
}

export type Failure<Code extends string> = { ok: false; error: { code: Code; message: string } };

function toRecord(run: {
  id: string;
  topicId: string;
  attempt: number;
  topicSlug: string;
  topicTitle: string;
  status: string;
  modelId: string;
  startedAt: Date;
  finishedAt: Date | null;
}): RunRecord {
  return {
    id: run.id,
    topicId: run.topicId,
    attempt: run.attempt,
    topicSlug: run.topicSlug,
    topicTitle: run.topicTitle,
    status: run.status,
    modelId: run.modelId,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt === null ? null : run.finishedAt.toISOString(),
  };
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ── 승인 ─────────────────────────────────────────────────────────────────────

export type RunApproveErrorCode = ApproveRunFailure | 'RUN_APPROVE_FAILED';
export type RunApproveResult = { ok: true; data: RunRecord } | Failure<RunApproveErrorCode>;

const APPROVE_MESSAGE: Record<ApproveRunFailure, string> = {
  RUN_NOT_FOUND: '실행을 찾을 수 없습니다.',
  NOT_PENDING_APPROVAL: '승인 대기 상태의 실행만 승인할 수 있습니다.',
};

export async function approveRunById(runId: string): Promise<RunApproveResult> {
  try {
    const result = await approveRun(prisma, runId);
    if (!result.ok) {
      return { ok: false, error: { code: result.code, message: APPROVE_MESSAGE[result.code] } };
    }
    return { ok: true, data: toRecord(result.run) };
  } catch (error) {
    return {
      ok: false,
      error: { code: 'RUN_APPROVE_FAILED', message: `승인하지 못했습니다: ${reason(error)}` },
    };
  }
}

// ── 수정 지시 ────────────────────────────────────────────────────────────────

export interface RunReviseInput {
  runId: string;
  instruction: string;
  startStep?: StepName;
  modelId?: string;
}

export type RunReviseErrorCode = ReviseRunFailure | 'RUN_REVISE_FAILED';

export interface RevisedRun {
  /** `revised`로 끝난 그 실행. */
  previous: RunRecord;
  /** 새로 대기열에 오른 다음 시도. */
  run: RunRecord;
  plan: { startStep: StepName; fresh: StepName[]; carried: StepName[] };
}

export type RunReviseResult = { ok: true; data: RevisedRun } | Failure<RunReviseErrorCode>;

const REVISE_MESSAGE: Record<ReviseRunFailure, string> = {
  RUN_NOT_FOUND: '실행을 찾을 수 없습니다.',
  NOT_PENDING_APPROVAL: '승인 대기 상태의 실행에만 수정 지시를 내릴 수 있습니다.',
  INSTRUCTION_TOO_LONG: '수정 지시가 너무 깁니다.',
  NOT_LATEST_ATTEMPT: '이 주제의 최신 시도에서만 다시 실행할 수 있습니다.',
  CARRIED_STEP_NOT_SUCCEEDED:
    '이어받을 이전 단계가 성공하지 않았습니다. 더 앞 단계부터 다시 실행해 주세요.',
  UNKNOWN_MODEL: '등록되지 않은 모델입니다.',
  MODEL_UNAVAILABLE: '이 모델의 API 키가 .env에 없습니다.',
};

export async function reviseRunById(input: RunReviseInput): Promise<RunReviseResult> {
  try {
    const registry = createModelRegistryFromEnv(process.env);
    const result = await reviseRun({ prisma, registry }, input);
    if (!result.ok) {
      return { ok: false, error: { code: result.code, message: REVISE_MESSAGE[result.code] } };
    }
    return {
      ok: true,
      data: {
        previous: toRecord(result.previous),
        run: toRecord(result.run),
        plan: {
          startStep: result.plan.startStep,
          fresh: [...result.plan.fresh],
          carried: [...result.plan.carried],
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'RUN_REVISE_FAILED',
        message: `수정 지시를 보내지 못했습니다: ${reason(error)}`,
      },
    };
  }
}

// ── 재실행 미리보기 ──────────────────────────────────────────────────────────

export interface RunRerunPlanInput {
  runId: string;
  instruction: string;
  startStep?: StepName;
}

export type RunRerunPlanErrorCode = PreviewRerunFailure | 'RUN_RERUN_PLAN_FAILED';

export interface RerunPlanView {
  startStep: StepName;
  fresh: StepName[];
  carried: StepName[];
  /** carried 단계 → 그 결과를 만든 실행 id(모르면 빠짐). 화면은 그 실행의 완료 시각을 붙인다. */
  sources: Partial<Record<StepName, string>>;
}

export type RunRerunPlanResult = { ok: true; data: RerunPlanView } | Failure<RunRerunPlanErrorCode>;

const PLAN_MESSAGE: Record<PreviewRerunFailure, string> = {
  RUN_NOT_FOUND: '실행을 찾을 수 없습니다.',
  INSTRUCTION_TOO_LONG: '수정 지시가 너무 깁니다.',
};

function toPlanView(preview: RerunPreview): RerunPlanView {
  return {
    startStep: preview.plan.startStep,
    fresh: [...preview.plan.fresh],
    carried: [...preview.plan.carried],
    sources: preview.sources,
  };
}

export async function planRerunById(input: RunRerunPlanInput): Promise<RunRerunPlanResult> {
  try {
    const result = await previewRerun(prisma, input);
    if (!result.ok) {
      return { ok: false, error: { code: result.code, message: PLAN_MESSAGE[result.code] } };
    }
    return { ok: true, data: toPlanView(result.preview) };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'RUN_RERUN_PLAN_FAILED',
        message: `재실행 계획을 만들지 못했습니다: ${reason(error)}`,
      },
    };
  }
}
