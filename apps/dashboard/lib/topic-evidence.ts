// 주제 근거(연결된 분석 글) 편집 어댑터(서버 전용) — "근거 편집" Dialog·실행 시작 Dialog가 쓴다.
// pipeline의 코드만 있는 결과에 한국어 문구를 붙여 { ok:false, error:{ code, message } }로 돌려준다(decisions/error-handling.md).
// 클라이언트에는 표시용 문자열만 간다 — kind·이유 라벨은 여기서 붙인다(컴포넌트는 pipeline 어휘를 모른다).
import 'server-only';
import {
  addTopicLink,
  listTopicLinks,
  prisma,
  removeTopicLink,
  searchAnalyses,
  type AnalysisKind,
  type AnalysisSearchHit,
  type TopicLinkAnalysis,
  type TopicLinkEntry,
} from '@galley/pipeline';

/** 목록·검색 결과 공통 — 분석 글 한 편의 표시 모델. */
export interface TopicEvidenceAnalysisView {
  analysisId: string;
  title: string;
  /** 인덱싱 때 redact된 요약(한 줄로 자른 것은 컴포넌트가). */
  summary: string;
  /** `영역 · spacehome` 또는 `변경 · spacehome · 2024-03`. */
  meta: string;
}

export interface TopicEvidenceLinkView extends TopicEvidenceAnalysisView {
  source: 'auto' | 'manual';
  /** 배지 글자. */
  sourceLabel: string;
  /** 자동 연결 규칙으로 본 이유(`키워드 react-router · 기간 일치`). 규칙 밖(수동만)이면 undefined. */
  reason: string | undefined;
}

export interface TopicEvidenceSearchHitView extends TopicEvidenceAnalysisView {
  /** 이미 manual·auto로 연결됨 — "추가" 대신 "연결됨"을 보인다. dismissed·없음은 false(추가 가능). */
  linked: boolean;
}

export type TopicEvidenceErrorCode =
  'TOPIC_NOT_FOUND' | 'ANALYSIS_NOT_FOUND' | 'LINK_NOT_FOUND' | 'TOPIC_EVIDENCE_FAILED';

export type TopicEvidenceFailure = {
  ok: false;
  error: { code: TopicEvidenceErrorCode; message: string };
};
export type TopicEvidenceListResult =
  { ok: true; data: { links: TopicEvidenceLinkView[] } } | TopicEvidenceFailure;
export type TopicEvidenceSearchResult =
  { ok: true; data: { hits: TopicEvidenceSearchHitView[] } } | TopicEvidenceFailure;
export type TopicEvidenceEditResult = { ok: true } | TopicEvidenceFailure;

const KIND_LABEL: Record<AnalysisKind, string> = {
  overview: '리포 전체',
  area: '영역',
  change: '변경',
};
const SOURCE_LABEL: Record<TopicLinkEntry['source'], string> = { auto: '자동', manual: '수동' };
const REASON_LABEL = { period: '기간 일치', repo: '리포 일치' } as const;

const MESSAGE: Record<Exclude<TopicEvidenceErrorCode, 'TOPIC_EVIDENCE_FAILED'>, string> = {
  TOPIC_NOT_FOUND: '큐에 없는 주제입니다. 파일에서 다시 불러온 뒤 시도해 주세요.',
  ANALYSIS_NOT_FOUND: '그 분석 글이 인덱스에서 사라졌습니다(재인덱싱됨). 다시 검색해 주세요.',
  LINK_NOT_FOUND: '이미 뗀 근거입니다.',
};

function analysisView(a: TopicLinkAnalysis): TopicEvidenceAnalysisView {
  const meta = [KIND_LABEL[a.kind], a.repoName, a.period ?? undefined]
    .filter((part): part is string => part !== undefined)
    .join(' · ');
  return { analysisId: a.analysisId, title: a.title, summary: a.summary, meta };
}

export function linkView(entry: TopicLinkEntry): TopicEvidenceLinkView {
  return {
    ...analysisView(entry),
    source: entry.source,
    sourceLabel: SOURCE_LABEL[entry.source],
    reason: entry.match === null ? undefined : reasonText(entry.match),
  };
}

function reasonText(match: NonNullable<TopicLinkEntry['match']>): string {
  return match.reasons
    .map((r) => (r === 'keyword' ? `키워드 ${match.matchedKeywords.join(', ')}` : REASON_LABEL[r]))
    .join(' · ');
}

export function searchHitView(hit: AnalysisSearchHit): TopicEvidenceSearchHitView {
  return {
    ...analysisView(hit),
    linked: hit.linkSource === 'manual' || hit.linkSource === 'auto',
  };
}

const failed = (what: string, error: unknown): TopicEvidenceFailure => {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    error: { code: 'TOPIC_EVIDENCE_FAILED', message: `${what}: ${reason}` },
  };
};

export async function getTopicEvidence(topicId: string): Promise<TopicEvidenceListResult> {
  try {
    const result = await listTopicLinks(prisma, topicId);
    if (!result.ok)
      return { ok: false, error: { code: result.code, message: MESSAGE[result.code] } };
    return { ok: true, data: { links: result.links.map(linkView) } };
  } catch (error) {
    return failed('근거 목록을 읽지 못했습니다', error);
  }
}

export async function searchTopicEvidence(
  topicId: string,
  query: string,
): Promise<TopicEvidenceSearchResult> {
  try {
    const hits = await searchAnalyses(prisma, { topicId, query });
    return { ok: true, data: { hits: hits.map(searchHitView) } };
  } catch (error) {
    return failed('인덱스를 검색하지 못했습니다', error);
  }
}

export async function addTopicEvidence(
  topicId: string,
  analysisId: string,
): Promise<TopicEvidenceEditResult> {
  try {
    const result = await addTopicLink(prisma, { topicId, analysisId });
    if (!result.ok)
      return { ok: false, error: { code: result.code, message: MESSAGE[result.code] } };
    return { ok: true };
  } catch (error) {
    return failed('근거를 추가하지 못했습니다', error);
  }
}

export async function removeTopicEvidence(
  topicId: string,
  analysisId: string,
): Promise<TopicEvidenceEditResult> {
  try {
    const result = await removeTopicLink(prisma, { topicId, analysisId });
    if (!result.ok)
      return { ok: false, error: { code: result.code, message: MESSAGE[result.code] } };
    return { ok: true };
  } catch (error) {
    return failed('근거를 떼지 못했습니다', error);
  }
}
