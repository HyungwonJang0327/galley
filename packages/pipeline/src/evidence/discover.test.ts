import { describe, test, expect } from 'vitest';
import { discoverAnalyses, periodDistance, periodWeight } from './discover.ts';
import { EVIDENCE_LIMITS } from './limits.ts';
import type { AnalysisCandidate } from '../link/matchTopic.ts';

const c = (
  id: string,
  kind: AnalysisCandidate['kind'],
  keywords: string[],
  period: string | null = null,
  repoName = 'app',
): AnalysisCandidate => ({ id, repoName, kind, key: `${kind}:${id}`, keywords, period });

const topic = { repoNames: [], keywords: ['react', 'scroll'], period: '2024-03' };
const none = new Set<string>();

describe('periodDistance · periodWeight', () => {
  test('기간 집합과 글의 달 사이 최소 거리, 기간·달이 없으면 null', () => {
    const months = new Set(['2024-03', '2024-04']);
    expect(periodDistance(months, '2024-04')).toBe(0);
    expect(periodDistance(months, '2024-01')).toBe(2);
    expect(periodDistance(months, '2024-07')).toBe(3);
    expect(periodDistance(months, null)).toBeNull();
    expect(periodDistance(new Set(), '2024-03')).toBeNull();
    expect(periodDistance(months, '2024')).toBeNull(); // 월 표기가 아니면 거리 없음
  });
  test('가중은 거리 0에서 1, 근접 범위 끝에서 1/(near+1), 넘으면 0', () => {
    expect(periodWeight(0, 2)).toBe(1);
    expect(periodWeight(1, 2)).toBeCloseTo(2 / 3);
    expect(periodWeight(2, 2)).toBeCloseTo(1 / 3);
    expect(periodWeight(3, 2)).toBe(0);
    expect(periodWeight(null, 2)).toBe(0);
  });
});

describe('discoverAnalyses', () => {
  test('키워드가 겹치는 글만, 겹침 수 + 기간 근접 가중 순 — 기간만 맞는 글은 안 고른다', () => {
    const analyses = [
      c('far', 'change', ['react'], '2023-06'), // 겹침 1, 거리 9 → 1
      c('near', 'change', ['react'], '2024-04'), // 겹침 1, 거리 1 → 1.667
      c('exact', 'change', ['react'], '2024-03'), // 겹침 1, 거리 0 → 2
      c('two', 'area', ['React', 'Scroll', 'infinite']), // 겹침 2 → 2 (area가 change보다 앞)
      c('period-only', 'change', ['vue'], '2024-03'), // 겹침 0 → 제외
      c('noise', 'area', ['re', '18']), // 쓸만한 키워드 없음 → 제외
    ];
    const got = discoverAnalyses(topic, analyses, { exclude: none });
    expect(got.map((d) => d.id)).toEqual(['two', 'exact', 'near', 'far']);
    expect(got[0]).toEqual({
      id: 'two',
      score: 2,
      matchedKeywords: ['react', 'scroll'],
      periodDistance: null,
    });
    expect(got[2]!.score).toBeCloseTo(1 + 2 / 3);
    expect(got[2]!.periodDistance).toBe(1);
    expect(got[3]!.periodDistance).toBe(9);
  });

  test('연결된 글(exclude)·다른 리포(repoNames)는 빼고, 주제 키워드가 없으면 빈 목록', () => {
    const analyses = [
      c('linked', 'area', ['react']),
      c('other-repo', 'area', ['react'], null, 'lib'),
      c('ok', 'area', ['react']),
    ];
    expect(
      discoverAnalyses({ ...topic, repoNames: ['app'] }, analyses, {
        exclude: new Set(['linked']),
      }).map((d) => d.id),
    ).toEqual(['ok']);
    expect(
      discoverAnalyses({ ...topic, keywords: ['18', '-'] }, analyses, { exclude: none }),
    ).toEqual([]);
  });

  test('동점은 kind → 리포 → key 순(결정적), 상한 maxDiscovered, rerank 훅은 상한 전에', () => {
    const analyses = [
      c('c2', 'change', ['react'], null, 'b'),
      c('c1', 'change', ['react'], null, 'a'),
      c('a1', 'area', ['react']),
      c('o1', 'overview', ['react']),
    ];
    expect(discoverAnalyses(topic, analyses, { exclude: none }).map((d) => d.id)).toEqual([
      'o1',
      'a1',
      'c1',
      'c2',
    ]);
    expect(
      discoverAnalyses(topic, analyses, {
        exclude: none,
        limits: { ...EVIDENCE_LIMITS, maxDiscovered: 2 },
      }).map((d) => d.id),
    ).toEqual(['o1', 'a1']);
    // 훅이 뒤집으면 상한은 뒤집힌 순서에 적용된다
    expect(
      discoverAnalyses(topic, analyses, {
        exclude: none,
        limits: { ...EVIDENCE_LIMITS, maxDiscovered: 2 },
        rerank: (ranked) => [...ranked].reverse(),
      }).map((d) => d.id),
    ).toEqual(['c2', 'c1']);
  });
});
