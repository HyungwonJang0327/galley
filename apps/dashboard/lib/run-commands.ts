// 승인·수정 지시·재실행 미리보기(서버 전용): pipeline이 Run 상태를 바꾸고, 실제 재실행은 워커가
// 집어간다 — decisions/run-location.md. 실패는 던지지 않고 { ok: false, error } 형태로 돌려주며,
// 코드 → 한국어 문구는 여기(앱 어댑터)에서 붙인다(decisions/error-handling.md ②).
// 승인은 posts/<슬러그>/ 쓰기·큐 완료 이동까지(B3a) — DATA_DIR·BLOG_DIR 스토어를 여기서 조립한다(조립 루트).
import 'server-only';
import {
  approveAndPublishRun,
  createModelRegistryFromEnv,
  LocalFsArtifactStore,
  LocalFsEvidenceStore,
  LocalFsPostsWriter,
  LocalFsStorage,
  previewRerun,
  prisma,
  reviseRun,
  type ApprovePublishFailure,
  type PreviewRerunFailure,
  type RerunPreview,
  type ReviseRunFailure,
  type StepName,
} from '@galley/pipeline';
import { resolveDashboardDataDir } from './data-dir';
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

export type RunApproveErrorCode =
  ApprovePublishFailure | 'BLOG_DIR_MISSING' | 'DATA_DIR_MISSING' | 'RUN_APPROVE_FAILED';

/** 승인 결과 — 실행 + 산출물이 놓인 posts 폴더(절대경로, 화면이 안내에 쓴다). */
export interface ApprovedRun extends RunRecord {
  postsDir: string;
}

export type RunApproveResult = { ok: true; data: ApprovedRun } | Failure<RunApproveErrorCode>;

const APPROVE_MESSAGE: Record<ApprovePublishFailure, (detail?: string) => string> = {
  RUN_NOT_FOUND: () => '실행을 찾을 수 없습니다.',
  NOT_PENDING_APPROVAL: () => '승인 대기 상태의 실행만 승인할 수 있습니다.',
  ARTIFACT_MISSING: (detail) =>
    `산출물(${detail ?? '?'})이 DATA_DIR에 없어 승인할 수 없습니다. 수정 지시로 다시 실행하세요.`,
  PUBLISH_TITLE_MISSING: () =>
    '발행정보에서 글 제목을 읽지 못했습니다. 발행정보 단계부터 다시 실행하세요.',
  TOPIC_NOT_IN_QUEUE: (detail) =>
    detail === '완료'
      ? '이 주제는 이미 완료 섹션에 있습니다.'
      : '주제_큐.md에서 이 주제를 찾지 못했습니다. 큐 파일을 확인하세요.',
  INVALID_COMPLETION: () => '완료 줄을 만들 수 없는 제목이나 슬러그입니다.',
  POSTS_DIR_EXISTS: (detail) =>
    `posts 폴더가 이미 있습니다(${detail ?? ''}). Galley가 만든 폴더가 아니면 옮기거나 지운 뒤 다시 승인하세요.`,
  POSTS_WRITE_FAILED: (detail) => `posts 폴더에 쓰지 못했습니다: ${detail ?? ''}`,
};

export async function approveRunById(runId: string): Promise<RunApproveResult> {
  const blogDir = process.env.BLOG_DIR;
  if (!blogDir) {
    return {
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '루트 .env에 BLOG_DIR이 없습니다.' },
    };
  }
  // 워커와 같은 규칙(절대경로·BLOG_DIR 밖) — 승인은 DATA_DIR을 읽기만 하지만 다른 폴더를 읽어 옛 산출물을 내보내면 안 된다.
  const dataDir = resolveDashboardDataDir({ DATA_DIR: process.env.DATA_DIR, BLOG_DIR: blogDir });
  if (!dataDir.ok) return { ok: false, error: { code: dataDir.code, message: dataDir.message } };
  try {
    const result = await approveAndPublishRun(
      {
        prisma,
        artifacts: new LocalFsArtifactStore(dataDir.dir),
        evidence: new LocalFsEvidenceStore(dataDir.dir),
        posts: new LocalFsPostsWriter(blogDir),
        storage: new LocalFsStorage(blogDir),
      },
      runId,
    );
    if (!result.ok) {
      return {
        ok: false,
        error: { code: result.code, message: APPROVE_MESSAGE[result.code](result.detail) },
      };
    }
    return { ok: true, data: { ...toRecord(result.run), postsDir: result.postsDir } };
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
