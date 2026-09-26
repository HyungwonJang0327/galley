// 실행 상세 타임라인의 산출물 미리보기(서버 전용, B2e). 단계가 DATA_DIR `artifacts/<슬러그>/<runId>/`에 쓴 마크다운을
// 서버 컴포넌트가 읽어 TimelineItem children으로 넘긴다 — GET API 없음(decisions/navigation.md 2026-09-26).
// carried 단계는 `sourceRunId`의 파일을 읽는다(승인 approvePublish와 같은 규칙). 근거 수집·근거 검증은 JSON이라
// 여기 없다(BE13). 파일이 없는 것(Mock 실행·B3a 전 실행)은 오류가 아니라 "없음" 상태다.
import 'server-only';
import {
  getRunWithSteps,
  isStepName,
  LINKEDIN_ARTIFACT,
  LocalFsArtifactStore,
  prisma,
  PUBLISH_ARTIFACT,
  STEP_ORIGIN,
  THUMBNAIL_ARTIFACT,
  VELOG_ARTIFACT,
  ZENN_ARTIFACT,
  type StepName,
} from '@galley/pipeline';
import { resolveDashboardDataDir } from './data-dir';
import type { Failure } from './run-commands';

/** 단계 → 마크다운 산출물 파일. 없는 단계(evidence·verify)는 펼침 자체가 없다. */
const MARKDOWN_ARTIFACT: Partial<Record<StepName, string>> = {
  velog: VELOG_ARTIFACT,
  linkedin: LINKEDIN_ARTIFACT,
  zenn: ZENN_ARTIFACT,
  publishInfo: PUBLISH_ARTIFACT,
};

export type StepArtifactView =
  /** 마크다운 본문. 발행정보 단계는 같은 Run의 썸네일 PNG가 있으면 그 URL도(이진이라 GET 라우트로 낸다). */
  | { kind: 'markdown'; text: string; thumbnailUrl?: string }
  /** DATA_DIR에 파일이 없다 — Mock 실행이거나 산출물을 쓰기 전(B3a 전) 실행. */
  | { kind: 'missing' }
  /** DATA_DIR 설정 오류·읽기 실패 — 사람이 읽는 문구. */
  | { kind: 'unavailable'; message: string };

export type RunArtifactViews = Partial<Record<StepName, StepArtifactView>>;

export interface RunForArtifacts {
  id: string;
  topicSlug: string;
  steps: readonly { name: string; status: string; origin: string; sourceRunId: string | null }[];
}

type StepRow = RunForArtifacts['steps'][number];

/** 그 단계 결과를 실제로 만든 Run — carried면 출처 Run, 아니면 이 Run. */
function producerOf(run: RunForArtifacts, step: StepRow): string {
  return step.origin === STEP_ORIGIN.carried && step.sourceRunId ? step.sourceRunId : run.id;
}

/** 읽을 수 있는 단계인가 — 성공한 단계만(실패·진행 중인 단계의 파일은 이전 시도 것일 수 있다). 미리보기·썸네일 라우트가 같은 판정. */
const isReadable = (step: StepRow): step is StepRow & { name: StepName } =>
  isStepName(step.name) && step.status === 'succeeded';

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * 성공한 단계의 마크다운 산출물을 읽는다. 결과는 단계 이름 → 보기 상태. 읽을 단계가 없으면 빈 객체.
 * 던지지 않는다 — 스토어가 던지면(슬러그가 경로로 못 쓰는 값 등) 그 단계만 unavailable.
 */
export async function getRunArtifacts(run: RunForArtifacts): Promise<RunArtifactViews> {
  const targets = run.steps.filter(isReadable).filter((step) => MARKDOWN_ARTIFACT[step.name]);
  if (targets.length === 0) return {};

  const dataDir = resolveDashboardDataDir({
    DATA_DIR: process.env.DATA_DIR,
    BLOG_DIR: process.env.BLOG_DIR,
  });
  const views: RunArtifactViews = {};
  if (!dataDir.ok) {
    for (const step of targets)
      views[step.name] = { kind: 'unavailable', message: dataDir.message };
    return views;
  }

  const store = new LocalFsArtifactStore(dataDir.dir);
  await Promise.all(
    targets.map(async (step) => {
      const file = MARKDOWN_ARTIFACT[step.name];
      if (file === undefined) return;
      const producer = producerOf(run, step);
      const view = await readView(store, run.topicSlug, producer, file);
      views[step.name] =
        view.kind === 'markdown' &&
        step.name === 'publishInfo' &&
        (await hasThumbnail(store, run.topicSlug, producer))
          ? { ...view, thumbnailUrl: thumbnailHref(run.id) }
          : view;
    }),
  );
  return views;
}

/** 썸네일 GET 라우트 경로 — 이 Run의 id로 부르면 라우트가 출처 Run을 다시 푼다. */
export const thumbnailHref = (runId: string) => `/api/runs/${encodeURIComponent(runId)}/thumbnail`;

/** 있는지만 본다 — 스토어에 exists가 없어 읽는다(발행정보가 끝난 Run은 폴링이 멈춰 있어 반복 비용이 없다). */
async function hasThumbnail(store: LocalFsArtifactStore, slug: string, runId: string) {
  try {
    return (await store.readBytes(slug, runId, THUMBNAIL_ARTIFACT)).ok;
  } catch {
    return false;
  }
}

async function readView(
  store: LocalFsArtifactStore,
  slug: string,
  runId: string,
  file: string,
): Promise<StepArtifactView> {
  try {
    const result = await store.read(slug, runId, file);
    if (result.ok) return { kind: 'markdown', text: result.text };
    if (result.code === 'ARTIFACT_MISSING') return { kind: 'missing' };
    return { kind: 'unavailable', message: `산출물(${file})을 읽지 못했습니다.` };
  } catch (error) {
    return { kind: 'unavailable', message: `산출물(${file})을 읽지 못했습니다: ${reason(error)}` };
  }
}

// ── 썸네일 PNG(GET /api/runs/[id]/thumbnail) ────────────────────────────────

export type RunThumbnailErrorCode =
  | 'RUN_NOT_FOUND'
  | 'DATA_DIR_MISSING'
  | 'THUMBNAIL_MISSING'
  | 'THUMBNAIL_UNREADABLE'
  | 'RUN_THUMBNAIL_FAILED';

export type RunThumbnailResult =
  { ok: true; data: { bytes: Uint8Array } } | Failure<RunThumbnailErrorCode>;

/** 발행정보 단계가 만든 썸네일 PNG — carried면 출처 Run의 파일. Run이 없거나 파일이 없으면 값으로. */
export async function getRunThumbnail(runId: string): Promise<RunThumbnailResult> {
  try {
    const run = await getRunWithSteps(prisma, runId);
    if (!run) {
      return { ok: false, error: { code: 'RUN_NOT_FOUND', message: '실행을 찾을 수 없습니다.' } };
    }
    const dataDir = resolveDashboardDataDir({
      DATA_DIR: process.env.DATA_DIR,
      BLOG_DIR: process.env.BLOG_DIR,
    });
    if (!dataDir.ok) return { ok: false, error: { code: dataDir.code, message: dataDir.message } };

    // 미리보기와 같은 판정 — 발행정보 단계가 성공한 Run만 썸네일이 있다.
    const step = run.steps.find((s) => s.name === 'publishInfo' && isReadable(s));
    if (!step) {
      return {
        ok: false,
        error: { code: 'THUMBNAIL_MISSING', message: '썸네일 파일이 없습니다.' },
      };
    }
    const result = await new LocalFsArtifactStore(dataDir.dir).readBytes(
      run.topicSlug,
      producerOf(run, step),
      THUMBNAIL_ARTIFACT,
    );
    if (result.ok) return { ok: true, data: { bytes: result.bytes } };
    return result.code === 'ARTIFACT_MISSING'
      ? { ok: false, error: { code: 'THUMBNAIL_MISSING', message: '썸네일 파일이 없습니다.' } }
      : {
          ok: false,
          error: { code: 'THUMBNAIL_UNREADABLE', message: '썸네일 파일을 읽지 못했습니다.' },
        };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'RUN_THUMBNAIL_FAILED',
        message: `썸네일을 불러오지 못했습니다: ${reason(error)}`,
      },
    };
  }
}
