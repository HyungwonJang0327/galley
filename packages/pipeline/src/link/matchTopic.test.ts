import { describe, test, expect } from 'vitest';
import { expandPeriod, matchTopic, usefulKeywords, type AnalysisCandidate } from './matchTopic.ts';
import { AUTO_LINK_LIMITS } from './limits.ts';

describe('usefulKeywords', () => {
  test('잡음(숫자·기호·1글자)을 거르고 NFC·소문자·중복 제거', () => {
    expect(
      usefulKeywords([
        'React',
        '18',
        '(',
        '-',
        'a',
        'ci',
        '  Nest ',
        'react',
        '한글'.normalize('NFD'),
      ]),
    ).toEqual(['react', 'ci', 'nest', '한글']);
  });
});

describe('expandPeriod', () => {
  test('연·연-월·범위·뒤집힌 범위·잘못된 값', () => {
    expect([...expandPeriod('2024-03')]).toEqual(['2024-03']);
    expect(expandPeriod('2024').size).toBe(12);
    expect([...expandPeriod('2024')][0]).toBe('2024-01');
    expect([...expandPeriod('2024-11~2025-02')]).toEqual([
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
    ]);
    expect([...expandPeriod('2025-02~2024-11')]).toEqual([
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
    ]);
    expect([...expandPeriod('2023~2024')]).toHaveLength(24);
    expect(expandPeriod('2020~2030').size).toBe(AUTO_LINK_LIMITS.maxMonths);
    expect(expandPeriod(null).size).toBe(0);
    expect(expandPeriod('2024.03').size).toBe(0);
    expect(expandPeriod('2024-13').size).toBe(0);
  });
});

describe('matchTopic', () => {
  const A: AnalysisCandidate[] = [
    {
      id: 'ov-a',
      repoName: 'spacehome',
      kind: 'overview',
      key: 'overview',
      keywords: ['commerce'],
      period: null,
    },
    {
      id: 'area-a',
      repoName: 'spacehome',
      kind: 'area',
      key: 'area:src',
      keywords: ['react-router', 'Scroll'],
      period: null,
    },
    {
      id: 'chg-a-3',
      repoName: 'spacehome',
      kind: 'change',
      key: 'change:2024-03',
      keywords: ['react-router'],
      period: '2024-03',
    },
    {
      id: 'chg-a-7',
      repoName: 'spacehome',
      kind: 'change',
      key: 'change:2024-07',
      keywords: ['cart'],
      period: '2024-07',
    },
    {
      id: 'ov-b',
      repoName: 'vendor-manager',
      kind: 'overview',
      key: 'overview',
      keywords: ['vendor'],
      period: null,
    },
    {
      id: 'chg-b-7',
      repoName: 'vendor-manager',
      kind: 'change',
      key: 'change:2024-07',
      keywords: ['react-router'],
      period: '2024-07',
    },
  ];

  test('키워드 겹침 + 기간으로 점수, 리포가 있으면 그 리포만', () => {
    const r = matchTopic(
      { repoNames: ['spacehome'], keywords: ['react-router', 'scroll'], period: '2024-03' },
      A,
    );
    expect(r).toEqual([
      { id: 'area-a', score: 2, reasons: ['keyword'], matchedKeywords: ['react-router', 'scroll'] },
      {
        id: 'chg-a-3',
        score: 2,
        reasons: ['keyword', 'period'],
        matchedKeywords: ['react-router'],
      },
    ]);
  });

  test('리포 없이 키워드만이면 모든 리포, 기간만이면 그 달의 change 글만(모든 리포)', () => {
    expect(
      matchTopic({ repoNames: [], keywords: ['react-router'], period: null }, A).map((m) => m.id),
    ).toEqual(['area-a', 'chg-a-3', 'chg-b-7']);
    expect(
      matchTopic({ repoNames: [], keywords: [], period: '2024-07' }, A).map((m) => m.id),
    ).toEqual(['chg-a-7', 'chg-b-7']);
  });

  test('리포만 적은 주제는 그 리포의 overview만', () => {
    expect(
      matchTopic({ repoNames: ['vendor-manager'], keywords: ['18'], period: null }, A),
    ).toEqual([{ id: 'ov-b', score: 1, reasons: ['repo'], matchedKeywords: [] }]);
  });

  test('아무 힌트도 없으면 아무것도 붙이지 않고, 상한을 지키며 점수·kind·key 순', () => {
    expect(matchTopic({ repoNames: [], keywords: [], period: null }, A)).toEqual([]);
    const many: AnalysisCandidate[] = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      repoName: 'r',
      kind: 'change',
      key: `change:2024-${String(i + 1).padStart(2, '0')}`,
      keywords: ['xx'],
      period: null,
    }));
    const r = matchTopic({ repoNames: [], keywords: ['xx'], period: null }, many, {
      ...AUTO_LINK_LIMITS,
      maxPerTopic: 3,
    });
    expect(r.map((m) => m.id)).toEqual(['c0', 'c1', 'c2']);
  });
});
