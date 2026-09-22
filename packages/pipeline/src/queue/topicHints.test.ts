import { describe, test, expect } from 'vitest';
import { isPeriodHint, parseTopicHints, resolveTopicHints } from './topicHints.ts';

describe('parseTopicHints', () => {
  test('결정의 네 형식', () => {
    expect(parseTopicHints('무한 스크롤 (spacehome, react-router)')).toEqual({
      terms: ['spacehome', 'react-router'],
      period: null,
    });
    expect(parseTopicHints('벤더 정산 (vendor manager, 2024.03)')).toEqual({
      terms: ['vendor manager'],
      period: '2024.03',
    });
    expect(parseTopicHints('콘솔 공유 (spacehome + vendor manager)')).toEqual({
      terms: ['spacehome', 'vendor manager'],
      period: null,
    });
    expect(parseTopicHints('회고 (2024.07)')).toEqual({ terms: [], period: '2024.07' });
  });

  test('힌트가 없으면 빈 값, 전각 괄호·여러 묶음·공백 정리·중복(대소문자) 제거, 기간은 첫 것만', () => {
    expect(parseTopicHints('그냥 제목')).toEqual({ terms: [], period: null });
    expect(parseTopicHints('제목 （SpaceHome， 2024.07 ~ 2024.09） (spacehome / Nest)')).toEqual({
      terms: ['SpaceHome', 'Nest'],
      period: '2024.07~2024.09',
    });
    expect(
      parseTopicHints('제목 (SpaceHome, 2024.07 ~ 2024.09) (spacehome / Nest, 2025.01)'),
    ).toEqual({
      terms: ['SpaceHome', 'Nest'],
      period: '2024.07~2024.09',
    });
    expect(parseTopicHints('PG사 무중단 전환기 (Toss → NicePay)')).toEqual({
      terms: ['Toss', 'NicePay'],
      period: null,
    });
  });

  test('isPeriodHint: 연·연.월·범위, 구분자 . - /', () => {
    for (const ok of [
      '2024',
      '2024.03',
      '2024-3',
      '2024/12',
      '2024.07~2024.09',
      '2024.07 – 2025.01',
    ])
      expect(isPeriodHint(ok), ok).toBe(true);
    for (const no of ['24.03', '2024.13a', 'v2024', '2024.03.15', 'react-router'])
      expect(isPeriodHint(no), no).toBe(false);
  });
});

describe('resolveTopicHints', () => {
  const repos = [
    { name: 'spacehome', aliases: ['SpaceHome', 'sh'] },
    { name: 'vendor-manager', aliases: ['vendor manager', 'VM'] },
  ];

  test('이름·alias(대소문자 무시)에 맞으면 정식 이름으로 repoNames, 아니면 소문자 keywords', () => {
    expect(
      resolveTopicHints(
        { terms: ['SpaceHome', 'react-router', 'vendor manager', 'sh', 'Nest'], period: '2024.03' },
        repos,
      ),
    ).toEqual({
      repoNames: ['spacehome', 'vendor-manager'],
      keywords: ['react-router', 'nest'],
      period: '2024.03',
    });
  });

  test('등록된 리포가 없으면 전부 키워드', () => {
    expect(resolveTopicHints({ terms: ['spacehome', 'Nest'], period: null }, [])).toEqual({
      repoNames: [],
      keywords: ['spacehome', 'nest'],
      period: null,
    });
  });
});
