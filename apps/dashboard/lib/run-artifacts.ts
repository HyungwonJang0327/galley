// 실행 상세 타임라인의 산출물 미리보기(서버 전용, B2e). 단계가 DATA_DIR `artifacts/<슬러그>/<runId>/`에 쓴 마크다운을
// 서버 컴포넌트가 읽어 TimelineItem children으로 넘긴다 — GET API 없음(decisions/navigation.md 2026-09-26).
// carried 단계는 `sourceRunId`의 파일을 읽는다(승인 approvePublish와 같은 규칙). 근거 수집·근거 검증은 JSON이라
// 여기 없다(BE13). 파일이 없는 것(Mock 실행·B3a 전 실행)은 오류가 아니라 "없음" 상태다.
import 'server-only';
import {
  isStepName,
  LINKEDIN_ARTIFACT,
  LocalFsArtifactStore,
  PUBLISH_ARTIFACT,
  STEP_ORIGIN,
  VELOG_ARTIFACT,
  ZENN_ARTIFACT,
  type StepName,
} from '@galley/pipeline';
import { resolveDashboardDataDir } from './data-dir';

/** 단계 → 마크다운 산출물 파일. 없는 단계(evidence·verify)는 펼침 자체가 없다. */
const MARKDOWN_ARTIFACT: Partial<Record<StepName, string>> = {
  velog: VELOG_ARTIFACT,
  linkedin: LINKEDIN_ARTIFACT,
  zenn: ZENN_ARTIFACT,
  publishInfo: PUBLISH_ARTIFACT,
};

export type StepArtifactView =
  | { kind: 'markdown'; text: string }
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

/** 그 단계 결과를 실제로 만든 Run — carried면 출처 Run, 아니면 이 Run. */
function producerOf(run: RunForArtifacts, step: RunForArtifacts['steps'][number]): string {
  return step.origin === STEP_ORIGIN.carried && step.sourceRunId ? step.sourceRunId : run.id;
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * 성공한 단계의 마크다운 산출물을 읽는다. 결과는 단계 이름 → 보기 상태. 읽을 단계가 없으면 빈 객체.
 * 던지지 않는다 — 스토어가 던지면(슬러그가 경로로 못 쓰는 값 등) 그 단계만 unavailable.
 */
export async function getRunArtifacts(run: RunForArtifacts): Promise<RunArtifactViews> {
  const targets = run.steps.filter(
    (step) => isStepName(step.name) && step.status === 'succeeded' && MARKDOWN_ARTIFACT[step.name],
  );
  if (targets.length === 0) return {};

  const dataDir = resolveDashboardDataDir({
    DATA_DIR: process.env.DATA_DIR,
    BLOG_DIR: process.env.BLOG_DIR,
  });
  const views: RunArtifactViews = {};
  if (!dataDir.ok) {
    for (const step of targets)
      if (isStepName(step.name))
        views[step.name] = { kind: 'unavailable', message: dataDir.message };
    return views;
  }

  const store = new LocalFsArtifactStore(dataDir.dir);
  await Promise.all(
    targets.map(async (step) => {
      if (!isStepName(step.name)) return;
      const file = MARKDOWN_ARTIFACT[step.name];
      if (file === undefined) return;
      views[step.name] = await readView(store, run.topicSlug, producerOf(run, step), file);
    }),
  );
  return views;
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
