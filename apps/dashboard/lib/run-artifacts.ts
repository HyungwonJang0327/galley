// 실행 상세 타임라인의 산출물 미리보기(서버 전용, B2e·BE13). 단계가 DATA_DIR `artifacts/<슬러그>/<runId>/`에 쓴 마크다운,
// `evidence/<슬러그>/<runId>.json` 근거 번들, `verification.json` 검증 리포트를 서버 컴포넌트가 읽어 TimelineItem children으로
// 넘긴다 — GET API 없음(decisions/navigation.md 2026-09-26). carried 단계는 `sourceRunId`의 파일을 읽는다(승인 approvePublish와
// 같은 규칙). 파일이 없는 것(Mock 실행·B3a 전 실행)은 오류가 아니라 "없음" 상태다. 값은 표시용으로 줄인 것(조각 미리보기 몇 줄,
// 해시 7자)이고 라벨은 화면(RunTimeline)이 붙인다.
import 'server-only';
import {
  getRunWithSteps,
  isStepName,
  LINKEDIN_ARTIFACT,
  LocalFsArtifactStore,
  LocalFsEvidenceStore,
  prisma,
  PUBLISH_ARTIFACT,
  STEP_ORIGIN,
  THUMBNAIL_ARTIFACT,
  VELOG_ARTIFACT,
  VERIFICATION_ARTIFACT,
  ZENN_ARTIFACT,
  type ClaimKind,
  type ClaimReason,
  type ClaimStatus,
  type EvidenceBundle,
  type EvidenceRef,
  type EvidenceSource,
  type StepName,
  type VerificationClaim,
  type VerificationReport,
} from '@galley/pipeline';
import { resolveDashboardDataDir } from './data-dir';
import type { Failure } from './run-commands';

/** 단계 → 마크다운 산출물 파일. 근거 수집·근거 검증은 JSON이라 따로 읽는다. */
const MARKDOWN_ARTIFACT: Partial<Record<StepName, string>> = {
  velog: VELOG_ARTIFACT,
  linkedin: LINKEDIN_ARTIFACT,
  zenn: ZENN_ARTIFACT,
  publishInfo: PUBLISH_ARTIFACT,
};

/** 조각 미리보기 줄 수 — 펼침 목록에서 한 항목이 차지하는 높이를 묶는다. */
export const SNIPPET_PREVIEW_LINES = 3;

export interface EvidenceItemView {
  path: string;
  /** 7자 해시. */
  commit: string;
  lineRange: { start: number; end: number };
  /** YYYY-MM-DD. */
  date: string;
  source: EvidenceSource;
  note?: string;
  /** 조각 앞 몇 줄(DATA_DIR 쪽 — 화면은 로컬이라 조각을 보여 준다, decisions/evidence-collection.md). */
  snippetPreview: string[];
  /** 미리보기 뒤에 더 있는가(조각이 SNIPPET_PREVIEW_LINES보다 길다). */
  hasMore: boolean;
  redacted: boolean;
  truncated: boolean;
}

export interface EvidenceView {
  linked: number;
  discovered: number;
  unreadable: number;
  filtered: boolean;
  items: EvidenceItemView[];
}

export interface ClaimView {
  text: string;
  kind: ClaimKind;
  status: ClaimStatus;
  /** 본문(velog.md) 줄 번호. */
  line: number;
  evidenceRef?: { path: string; commit: string; lineRange: { start: number; end: number } };
  reason?: ClaimReason;
  note?: string;
}

export interface VerificationView {
  counts: Record<ClaimStatus, number>;
  /** unsupported → uncertain → supported 순(검수자가 먼저 볼 것부터), 같은 상태 안에서는 본문 줄 순. */
  claims: ClaimView[];
  /** 본문이 근거 조각을 그대로 담은 자리 수(클린룸 검사). */
  verbatimMatches: number;
  judge: VerificationReport['judge']['status'];
}

export type StepArtifactView =
  /** 마크다운 본문. 발행정보 단계는 같은 Run의 썸네일 PNG가 있으면 그 URL도(이진이라 GET 라우트로 낸다). */
  | { kind: 'markdown'; text: string; thumbnailUrl?: string }
  | { kind: 'evidence'; evidence: EvidenceView }
  | { kind: 'verification'; verification: VerificationView }
  /** DATA_DIR에 파일이 없다 — Mock 실행이거나 산출물을 쓰기 전(B3a 전) 실행. */
  | { kind: 'missing' }
  /** DATA_DIR 설정 오류·읽기 실패·형식 불량 — 사람이 읽는 문구. */
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

interface Stores {
  artifacts: LocalFsArtifactStore;
  evidence: LocalFsEvidenceStore;
}

/**
 * 성공한 단계의 산출물을 읽는다. 결과는 단계 이름 → 보기 상태. 읽을 단계가 없으면 빈 객체.
 * 던지지 않는다 — 스토어가 던지면(슬러그가 경로로 못 쓰는 값 등) 그 단계만 unavailable.
 */
export async function getRunArtifacts(run: RunForArtifacts): Promise<RunArtifactViews> {
  const targets = run.steps.filter(isReadable);
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

  const stores: Stores = {
    artifacts: new LocalFsArtifactStore(dataDir.dir),
    evidence: new LocalFsEvidenceStore(dataDir.dir),
  };
  await Promise.all(
    targets.map(async (step) => {
      const producer = producerOf(run, step);
      views[step.name] = await readStep(stores, run, step.name, producer);
    }),
  );
  return views;
}

async function readStep(
  stores: Stores,
  run: RunForArtifacts,
  name: StepName,
  producer: string,
): Promise<StepArtifactView> {
  const slug = run.topicSlug;
  try {
    if (name === 'evidence') return await readEvidence(stores.evidence, slug, producer);
    if (name === 'verify') return await readVerification(stores.artifacts, slug, producer);
    const file = MARKDOWN_ARTIFACT[name];
    if (file === undefined) return { kind: 'missing' };
    const view = await readMarkdown(stores.artifacts, slug, producer, file);
    return view.kind === 'markdown' &&
      name === 'publishInfo' &&
      (await hasThumbnail(stores.artifacts, slug, producer))
      ? { ...view, thumbnailUrl: thumbnailHref(run.id) }
      : view;
  } catch (error) {
    return { kind: 'unavailable', message: `산출물을 읽지 못했습니다: ${reason(error)}` };
  }
}

async function readMarkdown(
  store: LocalFsArtifactStore,
  slug: string,
  runId: string,
  file: string,
): Promise<StepArtifactView> {
  const result = await store.read(slug, runId, file);
  if (result.ok) return { kind: 'markdown', text: result.text };
  if (result.code === 'ARTIFACT_MISSING') return { kind: 'missing' };
  return { kind: 'unavailable', message: `산출물(${file})을 읽지 못했습니다.` };
}

async function readEvidence(
  store: LocalFsEvidenceStore,
  slug: string,
  runId: string,
): Promise<StepArtifactView> {
  const result = await store.read(slug, runId);
  if (result.ok) return { kind: 'evidence', evidence: toEvidenceView(result.bundle) };
  if (result.code === 'EVIDENCE_BUNDLE_MISSING') return { kind: 'missing' };
  return {
    kind: 'unavailable',
    message:
      result.code === 'EVIDENCE_BUNDLE_INVALID'
        ? '근거 번들 파일의 형식이 맞지 않습니다.'
        : '근거 번들 파일을 읽지 못했습니다.',
  };
}

async function readVerification(
  store: LocalFsArtifactStore,
  slug: string,
  runId: string,
): Promise<StepArtifactView> {
  const result = await store.read(slug, runId, VERIFICATION_ARTIFACT);
  if (!result.ok) {
    return result.code === 'ARTIFACT_MISSING'
      ? { kind: 'missing' }
      : { kind: 'unavailable', message: `산출물(${VERIFICATION_ARTIFACT})을 읽지 못했습니다.` };
  }
  const report = parseVerificationReport(result.text);
  return report
    ? { kind: 'verification', verification: toVerificationView(report) }
    : {
        kind: 'unavailable',
        message: `검증 리포트(${VERIFICATION_ARTIFACT})의 형식이 맞지 않습니다.`,
      };
}

const shortSha = (commit: string) => commit.slice(0, 7);

export function toEvidenceView(bundle: EvidenceBundle): EvidenceView {
  const items = bundle.items.map((item): EvidenceItemView => {
    const lines = item.snippet.split(/\r?\n/);
    return {
      path: item.path,
      commit: shortSha(item.commit),
      lineRange: item.lineRange,
      date: item.date.slice(0, 10),
      source: item.source,
      ...(item.note === undefined ? {} : { note: item.note }),
      snippetPreview: lines.slice(0, SNIPPET_PREVIEW_LINES),
      hasMore: lines.length > SNIPPET_PREVIEW_LINES,
      redacted: item.redacted,
      truncated: item.truncated,
    };
  });
  return {
    linked: items.filter((i) => i.source === 'linked').length,
    discovered: items.filter((i) => i.source === 'discovered').length,
    unreadable: bundle.unreadable,
    filtered: bundle.filtered,
    items,
  };
}

const CLAIM_ORDER: Record<ClaimStatus, number> = { unsupported: 0, uncertain: 1, supported: 2 };

const toRef = (ref: EvidenceRef) => ({
  path: ref.path,
  commit: shortSha(ref.commit),
  lineRange: ref.lineRange,
});

export function toVerificationView(report: VerificationReport): VerificationView {
  const claims = report.claims
    .map((claim): ClaimView => ({
      text: claim.text,
      kind: claim.kind,
      status: claim.status,
      line: claim.line,
      ...(claim.evidenceRef === undefined ? {} : { evidenceRef: toRef(claim.evidenceRef) }),
      ...(claim.reason === undefined ? {} : { reason: claim.reason }),
      ...(claim.note === undefined ? {} : { note: claim.note }),
    }))
    .sort((a, b) => CLAIM_ORDER[a.status] - CLAIM_ORDER[b.status] || a.line - b.line);
  return {
    counts: report.counts,
    claims,
    verbatimMatches: report.cleanRoom.matches.length,
    judge: report.judge.status,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const STATUSES: readonly ClaimStatus[] = ['supported', 'unsupported', 'uncertain'];

/**
 * verification.json → 리포트. 단계가 쓴 파일이지만 사람이 손댈 수 있어 형식만 본다(version 1·counts 셋·claims 배열·
 * cleanRoom.matches 배열·judge.status). 맞지 않으면 undefined — 화면은 "형식이 맞지 않음"으로.
 */
export function parseVerificationReport(text: string): VerificationReport | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(json) || json['version'] !== 1) return undefined;
  const { counts, claims, cleanRoom, judge } = json;
  if (!isRecord(counts) || !STATUSES.every((s) => isCount(counts[s]))) return undefined;
  if (!Array.isArray(claims) || !claims.every(isClaim)) return undefined;
  if (!isRecord(cleanRoom) || !Array.isArray(cleanRoom['matches'])) return undefined;
  if (!isRecord(judge) || typeof judge['status'] !== 'string') return undefined;
  return json as unknown as VerificationReport;
}

function isClaim(v: unknown): v is VerificationClaim {
  return (
    isRecord(v) &&
    typeof v['text'] === 'string' &&
    typeof v['kind'] === 'string' &&
    typeof v['status'] === 'string' &&
    STATUSES.includes(v['status'] as ClaimStatus) &&
    typeof v['line'] === 'number'
  );
}

// ── 목록 행 "근거 없음 n"(BE13) ─────────────────────────────────────────────

export interface VerificationFlags {
  unsupported: number;
  uncertain: number;
}

/**
 * 목록의 각 Run에 대해 근거 검증 결과 수만 읽는다(성공한 검증 단계가 있는 Run만, carried면 출처 Run 파일). 결과는 Run id →
 * 수. 파일이 없거나 DATA_DIR이 없으면 그 Run은 빠진다(목록은 표시만이라 문구를 만들지 않는다).
 */
export async function getRunVerificationFlags(
  runs: readonly RunForArtifacts[],
): Promise<Record<string, VerificationFlags>> {
  const targets = runs
    .map((run) => {
      const verify = run.steps.find((s) => s.name === 'verify' && isReadable(s));
      return verify ? { run, producer: producerOf(run, verify) } : undefined;
    })
    .filter((t) => t !== undefined);
  if (targets.length === 0) return {};

  const dataDir = resolveDashboardDataDir({
    DATA_DIR: process.env.DATA_DIR,
    BLOG_DIR: process.env.BLOG_DIR,
  });
  if (!dataDir.ok) return {};
  const store = new LocalFsArtifactStore(dataDir.dir);
  const flags: Record<string, VerificationFlags> = {};
  await Promise.all(
    targets.map(async ({ run, producer }) => {
      try {
        const result = await store.read(run.topicSlug, producer, VERIFICATION_ARTIFACT);
        if (!result.ok) return;
        const report = parseVerificationReport(result.text);
        if (!report) return;
        flags[run.id] = {
          unsupported: report.counts.unsupported,
          uncertain: report.counts.uncertain,
        };
      } catch {
        // 목록은 표시만 — 한 행이 못 읽어도 나머지 행은 그린다.
      }
    }),
  );
  return flags;
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
