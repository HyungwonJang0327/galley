// 주제 ↔ 분석 글 연결의 사람 편집(BE12) — "근거 편집" Dialog가 쓰는 도메인 함수. 모델 없음.
// 규칙(decisions/evidence-collection.md 2026-09-22 BE7 ⑪): "추가"는 manual — 이미 auto·dismissed면 create가 아니라
// source 갱신(승격). "제거"는 지우지 않고 **dismissed**로 바꾼다(자동 연결이 되살리지 않게, manual도 같은 길).
// 목록·근거 수집은 manual·auto만 본다. 연결 이유는 DB에 없고 `matchTopic`으로 다시 계산해 보인다(재인덱싱 뒤 어긋날 수 있다).
import type { PrismaClient } from '@prisma/client';
import {
  LINK_SOURCE,
  isAnalysisKind,
  parseStringArray,
  type AnalysisKind,
  type LinkSource,
} from '../index/schema.ts';
import { AUTO_LINK_LIMITS } from './limits.ts';
import { matchTopic, type AnalysisCandidate, type MatchedAnalysis } from './matchTopic.ts';

/** 목록·검색 결과의 분석 글 한 편(요약은 인덱싱 때 redact된 값). */
export interface TopicLinkAnalysis {
  analysisId: string;
  kind: AnalysisKind;
  title: string;
  summary: string;
  repoName: string;
  key: string;
  /** change의 `YYYY-MM`, 그 밖은 null. */
  period: string | null;
}

export interface TopicLinkEntry extends TopicLinkAnalysis {
  source: 'auto' | 'manual';
  /** 자동 연결 규칙으로 다시 계산한 이유. 규칙에 안 맞으면(수동으로만 붙인 글) null. */
  match: { reasons: MatchedAnalysis['reasons']; matchedKeywords: string[] } | null;
}

export type ListTopicLinksResult =
  { ok: true; links: TopicLinkEntry[] } | { ok: false; code: 'TOPIC_NOT_FOUND' };

const ANALYSIS_SELECT = {
  id: true,
  kind: true,
  key: true,
  title: true,
  summary: true,
  keywords: true,
  period: true,
  repo: { select: { name: true } },
} as const;
type AnalysisRow = {
  id: string;
  kind: string;
  key: string;
  title: string;
  summary: string;
  keywords: string;
  period: string | null;
  repo: { name: string };
};

function toAnalysis(row: AnalysisRow): TopicLinkAnalysis | null {
  if (!isAnalysisKind(row.kind)) return null;
  return {
    analysisId: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    repoName: row.repo.name,
    key: row.key,
    period: row.period,
  };
}
const toCandidate = (row: AnalysisRow, kind: AnalysisKind): AnalysisCandidate => ({
  id: row.id,
  repoName: row.repo.name,
  kind,
  key: row.key,
  keywords: parseStringArray(row.keywords),
  period: row.period,
});

/** 주제의 연결 목록 — manual 먼저, 그다음 auto, 같은 소스 안에서는 만든 순(근거 수집이 읽는 순서와 같다). */
export async function listTopicLinks(
  prisma: PrismaClient,
  topicId: string,
): Promise<ListTopicLinksResult> {
  const topic = await prisma.queueItem.findUnique({
    where: { id: topicId },
    select: { repoNames: true, keywords: true, period: true },
  });
  if (topic === null) return { ok: false, code: 'TOPIC_NOT_FOUND' };
  const rows = await prisma.topicAnalysisLink.findMany({
    where: { topicId, source: { in: [LINK_SOURCE.manual, LINK_SOURCE.auto] } },
    orderBy: { createdAt: 'asc' },
    select: { source: true, analysis: { select: ANALYSIS_SELECT } },
  });
  const ordered = [
    ...rows.filter((r) => r.source === LINK_SOURCE.manual),
    ...rows.filter((r) => r.source === LINK_SOURCE.auto),
  ];
  // 이유는 연결된 글만 후보로 넣고 상한 없이 다시 계산한다 — 자동 연결의 상한에 밀렸던 manual 글도 이유가 보인다.
  const candidates: AnalysisCandidate[] = [];
  for (const r of ordered) {
    if (isAnalysisKind(r.analysis.kind)) candidates.push(toCandidate(r.analysis, r.analysis.kind));
  }
  const matched = new Map(
    matchTopic(
      {
        repoNames: parseStringArray(topic.repoNames),
        keywords: parseStringArray(topic.keywords),
        period: topic.period,
      },
      candidates,
      { ...AUTO_LINK_LIMITS, maxPerTopic: Number.MAX_SAFE_INTEGER },
    ).map((m) => [m.id, m] as const),
  );
  const links: TopicLinkEntry[] = [];
  for (const r of ordered) {
    const analysis = toAnalysis(r.analysis);
    if (analysis === null) continue;
    const m = matched.get(analysis.analysisId);
    links.push({
      ...analysis,
      source: r.source === LINK_SOURCE.manual ? 'manual' : 'auto',
      match: m === undefined ? null : { reasons: m.reasons, matchedKeywords: m.matchedKeywords },
    });
  }
  return { ok: true, links };
}

export interface SearchAnalysesInput {
  topicId: string;
  /** 제목·키·키워드에 대한 부분 일치(대소문자 무시). 공백만이면 빈 결과. */
  query: string;
  /** 기본 20. */
  limit?: number;
}
export interface AnalysisSearchHit extends TopicLinkAnalysis {
  /** 이 주제와의 현재 연결 상태. 없으면 null. dismissed도 돌려준다(다시 "추가"하면 manual로 승격). */
  linkSource: LinkSource | null;
}

/** Dialog 안 인덱스 검색 — 리포 이름 → kind → key 순(결정적). */
export async function searchAnalyses(
  prisma: PrismaClient,
  input: SearchAnalysesInput,
): Promise<AnalysisSearchHit[]> {
  const query = input.query.trim();
  if (query.length === 0) return [];
  const limit = input.limit ?? 20;
  const rows = await prisma.repoAnalysis.findMany({
    where: {
      OR: [
        { title: { contains: query } },
        { key: { contains: query } },
        // keywords는 소문자 JSON 배열 — 소문자로 맞춰 찾는다.
        { keywords: { contains: query.toLowerCase() } },
      ],
    },
    orderBy: [{ repo: { name: 'asc' } }, { kind: 'asc' }, { key: 'asc' }],
    take: limit,
    select: ANALYSIS_SELECT,
  });
  const links = await prisma.topicAnalysisLink.findMany({
    where: { topicId: input.topicId, analysisId: { in: rows.map((r) => r.id) } },
    select: { analysisId: true, source: true },
  });
  const sourceOf = new Map(links.map((l) => [l.analysisId, l.source]));
  const out: AnalysisSearchHit[] = [];
  for (const row of rows) {
    const analysis = toAnalysis(row);
    if (analysis === null) continue;
    const source = sourceOf.get(row.id);
    out.push({
      ...analysis,
      linkSource: source !== undefined && isLinkSourceValue(source) ? source : null,
    });
  }
  return out;
}
const isLinkSourceValue = (v: string): v is LinkSource =>
  (Object.values(LINK_SOURCE) as string[]).includes(v);

export type AddTopicLinkResult =
  /** previous = 바꾸기 전 소스(없었으면 null). 이미 manual이면 그대로 두고 previous='manual'. */
  | { ok: true; previous: LinkSource | null }
  | { ok: false; code: 'TOPIC_NOT_FOUND' | 'ANALYSIS_NOT_FOUND' };

/** "추가" — manual 연결. auto·dismissed면 승격(source 갱신), 없으면 생성. */
export async function addTopicLink(
  prisma: PrismaClient,
  input: { topicId: string; analysisId: string },
): Promise<AddTopicLinkResult> {
  const [topic, analysis, existing] = await Promise.all([
    prisma.queueItem.findUnique({ where: { id: input.topicId }, select: { id: true } }),
    prisma.repoAnalysis.findUnique({ where: { id: input.analysisId }, select: { id: true } }),
    prisma.topicAnalysisLink.findUnique({
      where: { topicId_analysisId: { topicId: input.topicId, analysisId: input.analysisId } },
      select: { id: true, source: true },
    }),
  ]);
  if (topic === null) return { ok: false, code: 'TOPIC_NOT_FOUND' };
  if (analysis === null) return { ok: false, code: 'ANALYSIS_NOT_FOUND' };
  if (existing === null) {
    try {
      await prisma.topicAnalysisLink.create({
        data: { topicId: input.topicId, analysisId: input.analysisId, source: LINK_SOURCE.manual },
      });
    } catch (error) {
      // 읽은 뒤 자동 연결 틱이 auto를 만들었으면(unique) 승격으로 이어간다.
      if (!isPrismaCode(error, ['P2002'])) throw error;
      await prisma.topicAnalysisLink.update({
        where: { topicId_analysisId: { topicId: input.topicId, analysisId: input.analysisId } },
        data: { source: LINK_SOURCE.manual },
      });
      return { ok: true, previous: LINK_SOURCE.auto };
    }
    return { ok: true, previous: null };
  }
  const previous = isLinkSourceValue(existing.source) ? existing.source : null;
  if (existing.source !== LINK_SOURCE.manual)
    await prisma.topicAnalysisLink.update({
      where: { id: existing.id },
      data: { source: LINK_SOURCE.manual },
    });
  return { ok: true, previous };
}

export type RemoveTopicLinkResult =
  | { ok: true; previous: 'auto' | 'manual' }
  /** manual·auto 연결이 없다(이미 뗐거나 애초에 없음). */
  | { ok: false; code: 'LINK_NOT_FOUND' };

/** "제거" — 행을 지우지 않고 dismissed로. 자동 연결이 다시 붙이지 않고, 목록·근거 수집에서 빠진다. */
export async function removeTopicLink(
  prisma: PrismaClient,
  input: { topicId: string; analysisId: string },
): Promise<RemoveTopicLinkResult> {
  const existing = await prisma.topicAnalysisLink.findUnique({
    where: { topicId_analysisId: { topicId: input.topicId, analysisId: input.analysisId } },
    select: { id: true, source: true },
  });
  if (existing === null || existing.source === LINK_SOURCE.dismissed)
    return { ok: false, code: 'LINK_NOT_FOUND' };
  await prisma.topicAnalysisLink.update({
    where: { id: existing.id },
    data: { source: LINK_SOURCE.dismissed },
  });
  return { ok: true, previous: existing.source === LINK_SOURCE.manual ? 'manual' : 'auto' };
}

const isPrismaCode = (error: unknown, codes: readonly string[]): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string' &&
  codes.includes(error.code);
