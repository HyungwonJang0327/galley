// discovered 선별(순수) — 근거 수집 단계 2(BE9). 주제에 **연결되지 않은** 분석 글 가운데 주제 키워드와 겹치는 것을 점수로 고른다.
// 모델 0회, 결정적. 점수 = 키워드 겹침 수 + 기간 근접 가중(change 글만, 주제 기간에서 가까울수록 1에 가깝게).
// 키워드가 하나도 겹치지 않는 글은 기간이 맞아도 고르지 않는다 — "키워드 점수만"(decisions/evidence-collection.md "근거 수집" 2).
// 모델 재순위는 Phase 2 — 여기서는 `rerank` 훅 자리만 둔다.
import {
  expandPeriod,
  usefulKeywords,
  type AnalysisCandidate,
  type TopicHintsInput,
} from '../link/matchTopic.ts';
import { EVIDENCE_LIMITS, type EvidenceLimits } from './limits.ts';

export interface DiscoveredAnalysis {
  id: string;
  /** 키워드 겹침 수 + 기간 근접 가중(0~1). */
  score: number;
  matchedKeywords: string[];
  /** 주제 기간과 글의 달 사이 거리(달 수). 기간이 없거나 change가 아니면 null. */
  periodDistance: number | null;
}

/** 재순위 훅 — 점수 순 목록을 받아 다시 늘어놓는다(상한 적용 전). 기본은 그대로. 모델 재순위는 Phase 2. */
export type DiscoverRerank = (
  ranked: readonly DiscoveredAnalysis[],
  topic: TopicHintsInput,
) => DiscoveredAnalysis[];

export interface DiscoverOptions {
  /** 이미 연결된 글(source 무관) — 탐색에서 뺀다. */
  exclude: ReadonlySet<string>;
  limits?: EvidenceLimits;
  rerank?: DiscoverRerank;
}

const YM = /^(\d{4})-(\d{2})$/;
const monthIndexOf = (ym: string): number | null => {
  const m = YM.exec(ym);
  if (m === null) return null;
  return Number(m[1]) * 12 + (Number(m[2]) - 1);
};

/** 주제 기간(달 집합)과 글의 달 사이 최소 거리. 기간이 비었으면 null. */
export function periodDistance(months: ReadonlySet<string>, period: string | null): number | null {
  if (period === null || months.size === 0) return null;
  const target = monthIndexOf(period);
  if (target === null) return null;
  let best: number | null = null;
  for (const ym of months) {
    const idx = monthIndexOf(ym);
    if (idx === null) continue;
    const d = Math.abs(idx - target);
    if (best === null || d < best) best = d;
  }
  return best;
}

/** 거리 0 → 1, 거리 d(≤ near) → (near + 1 - d) / (near + 1), 넘으면 0. */
export function periodWeight(distance: number | null, nearMonths: number): number {
  if (distance === null || distance > nearMonths) return 0;
  return (nearMonths + 1 - distance) / (nearMonths + 1);
}

/**
 * 규칙:
 * - `exclude`(연결된 글)는 뺀다. `repoNames`가 있으면 그 리포의 글만.
 * - 키워드 겹침(정확히 같은 토큰) 하나당 1점. **겹침 0이면 버린다.**
 * - change 글의 달이 주제 기간에 가까우면 `periodWeight`를 더한다(최대 1).
 * - 점수 내림차순 → kind(overview·area·change) → 리포 이름 → key 순(결정적) → `rerank` 훅 → 상한 `maxDiscovered`.
 */
export function discoverAnalyses(
  topic: TopicHintsInput,
  analyses: readonly AnalysisCandidate[],
  options: DiscoverOptions,
): DiscoveredAnalysis[] {
  const limits = options.limits ?? EVIDENCE_LIMITS;
  const keywords = new Set(usefulKeywords(topic.keywords));
  if (keywords.size === 0) return [];
  const repoFilter = new Set(topic.repoNames);
  const months = expandPeriod(topic.period);

  const out: DiscoveredAnalysis[] = [];
  for (const a of analyses) {
    if (options.exclude.has(a.id)) continue;
    if (repoFilter.size > 0 && !repoFilter.has(a.repoName)) continue;
    const matchedKeywords = usefulKeywords(a.keywords).filter((k) => keywords.has(k));
    if (matchedKeywords.length === 0) continue;
    const distance = a.kind === 'change' ? periodDistance(months, a.period) : null;
    out.push({
      id: a.id,
      score: matchedKeywords.length + periodWeight(distance, limits.periodNearMonths),
      matchedKeywords: matchedKeywords.sort(),
      periodDistance: distance,
    });
  }
  const KIND_ORDER = { overview: 0, area: 1, change: 2 } as const;
  const byId = new Map(analyses.map((a) => [a.id, a] as const));
  out.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    const ax = byId.get(x.id)!;
    const ay = byId.get(y.id)!;
    if (KIND_ORDER[ax.kind] !== KIND_ORDER[ay.kind])
      return KIND_ORDER[ax.kind] - KIND_ORDER[ay.kind];
    if (ax.repoName !== ay.repoName) return ax.repoName < ay.repoName ? -1 : 1;
    return ax.key < ay.key ? -1 : ax.key > ay.key ? 1 : 0;
  });
  const ranked = options.rerank === undefined ? out : options.rerank(out, topic);
  return ranked.slice(0, limits.maxDiscovered);
}
