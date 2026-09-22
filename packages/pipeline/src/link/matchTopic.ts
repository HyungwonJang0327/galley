// 주제 ↔ 분석 글 매칭(순수) — 모델 호출 없이 키워드·기간·리포 이름만으로 후보를 고르고 점수를 매긴다.
// 입력은 QueueItem의 힌트 컬럼(BE6이 채움: repoNames 정식 이름 · keywords 소문자 · period 정규형)과 RepoAnalysis의
// keywords(소문자)·period(`YYYY-MM`, change만)·kind. 결정: decisions/evidence-collection.md "주제 ↔ 분석 글 연결"(BE7).
import { AUTO_LINK_LIMITS, type AutoLinkLimits } from './limits.ts';

export interface TopicHintsInput {
  /** Repo.name 정식 이름. 비어 있으면 모든 리포. */
  repoNames: readonly string[];
  keywords: readonly string[];
  /** `YYYY` · `YYYY-MM` · `YYYY-MM~YYYY-MM` · null. */
  period: string | null;
}

export interface AnalysisCandidate {
  id: string;
  repoName: string;
  kind: 'overview' | 'area' | 'change';
  key: string;
  keywords: readonly string[];
  /** change의 `YYYY-MM`, 그 밖은 null. */
  period: string | null;
}

export interface MatchedAnalysis {
  id: string;
  score: number;
  /** 왜 붙었는지 — 큐 행 보조 텍스트·근거 편집 Dialog가 보여줄 수 있게. */
  reasons: ('keyword' | 'period' | 'repo')[];
  matchedKeywords: string[];
}

const HAS_LETTER = /\p{L}/u;

/**
 * 매칭에 쓸 만한 키워드만 — 본문 괄호에서 온 잡음(`18` · `(` · `-`)을 거른다: 글자가 하나도 없거나 2글자 미만이면 뺀다.
 * 양쪽 다 NFC·소문자로 맞춘다(인덱서 키워드는 모델 출력이라 NFC를 보장하지 않는다 — BE6 리뷰 9).
 */
export function usefulKeywords(keywords: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of keywords) {
    const k = raw.normalize('NFC').trim().toLowerCase();
    if (k.length < 2 || !HAS_LETTER.test(k)) continue;
    out.add(k);
  }
  return [...out];
}

const YM = /^(\d{4})(?:-(\d{2}))?$/;
const monthIndex = (year: number, month: number) => year * 12 + (month - 1);
const monthKey = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

/**
 * 기간 정규형 → 달(`YYYY-MM`) 집합. `2024` → 12달, `2024-07~2024-09` → 3달, 범위 방향이 뒤집혀 있으면 바로잡는다.
 * 형식이 아니면 빈 집합(매칭에 기간을 쓰지 않는다). 상한 `maxMonths`를 넘으면 앞부터 자른다.
 */
export function expandPeriod(period: string | null): Set<string> {
  const months = new Set<string>();
  if (period === null) return months;
  const [fromRaw, toRaw] = period.split('~');
  const parse = (s: string | undefined): [number, number] | undefined => {
    if (s === undefined) return undefined;
    const m = YM.exec(s.trim());
    if (m === null) return undefined;
    const year = Number(m[1]);
    const month = m[2] === undefined ? undefined : Number(m[2]);
    if (month !== undefined && (month < 1 || month > 12)) return undefined;
    return [year, month ?? 0];
  };
  const from = parse(fromRaw);
  if (from === undefined) return months;
  const to = toRaw === undefined ? from : parse(toRaw);
  if (to === undefined) return months;
  // 연 단위는 그 해 전체: 시작은 1월, 끝은 12월.
  let start = monthIndex(from[0], from[1] === 0 ? 1 : from[1]);
  let end = monthIndex(to[0], to[1] === 0 ? 12 : to[1]);
  if (start > end) [start, end] = [end, start];
  for (let i = start; i <= end && months.size < AUTO_LINK_LIMITS.maxMonths; i += 1)
    months.add(monthKey(i));
  return months;
}

/**
 * 후보를 고르고 점수를 매긴다(모델 없음). 규칙:
 * - `repoNames`가 있으면 그 리포의 글만 본다(리포 좁힘). 없으면 전부.
 * - 키워드 겹침(정확히 같은 토큰) 하나당 1점 → `keyword`.
 * - change 글의 달이 주제 기간 안이면 1점 → `period`.
 * - 리포만 적은 주제(키워드·기간 없음)는 그 리포의 `overview`만 붙인다 → `repo`(리포 전체 글을 다 붙이지 않는다).
 * 점수 0은 버리고, 점수 내림차순 → kind(overview·area·change) → key 순으로 상한(`maxPerTopic`)까지.
 */
export function matchTopic(
  topic: TopicHintsInput,
  analyses: readonly AnalysisCandidate[],
  limits: AutoLinkLimits = AUTO_LINK_LIMITS,
): MatchedAnalysis[] {
  const repoFilter = new Set(topic.repoNames);
  const keywords = new Set(usefulKeywords(topic.keywords));
  const months = expandPeriod(topic.period);
  const repoOnly = repoFilter.size > 0 && keywords.size === 0 && months.size === 0;

  const out: MatchedAnalysis[] = [];
  for (const a of analyses) {
    if (repoFilter.size > 0 && !repoFilter.has(a.repoName)) continue;
    const reasons: MatchedAnalysis['reasons'] = [];
    const matchedKeywords: string[] = [];
    let score = 0;
    if (repoOnly) {
      if (a.kind !== 'overview') continue;
      reasons.push('repo');
      score = 1;
    } else {
      for (const k of usefulKeywords(a.keywords)) {
        if (keywords.has(k)) matchedKeywords.push(k);
      }
      if (matchedKeywords.length > 0) {
        reasons.push('keyword');
        score += matchedKeywords.length;
      }
      if (a.kind === 'change' && a.period !== null && months.has(a.period)) {
        reasons.push('period');
        score += 1;
      }
    }
    if (score === 0) continue;
    out.push({ id: a.id, score, reasons, matchedKeywords: matchedKeywords.sort() });
  }
  const KIND_ORDER = { overview: 0, area: 1, change: 2 } as const;
  const byId = new Map(analyses.map((a) => [a.id, a] as const));
  out.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    const ax = byId.get(x.id)!;
    const ay = byId.get(y.id)!;
    if (KIND_ORDER[ax.kind] !== KIND_ORDER[ay.kind])
      return KIND_ORDER[ax.kind] - KIND_ORDER[ay.kind];
    return ax.key < ay.key ? -1 : ax.key > ay.key ? 1 : 0;
  });
  return out.slice(0, limits.maxPerTopic);
}
