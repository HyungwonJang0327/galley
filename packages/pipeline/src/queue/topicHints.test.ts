import { describe, test, expect } from 'vitest';
import {
  isAlreadyPublished,
  isPeriodHint,
  normalizePeriodHint,
  parseTopicHints,
  resolveTopicHints,
} from './topicHints.ts';

describe('parseTopicHints', () => {
  test('(기존 글) 메모는 키워드로 세지 않는다(이미 발행된 시리즈 편 표시)', () => {
    expect(parseTopicHints('(기존 글) DB 세션 다시 보기 (linklet)')).toEqual({
      terms: ['linklet'],
      period: null,
    });
    expect(parseTopicHints('세션 (기존  글, 2025.11)')).toEqual({ terms: [], period: '2025-11' });
  });

  test('기존 글이 다른 항의 일부면 그대로 둔다', () => {
    expect(parseTopicHints('정리 (기존 글 리라이트)').terms).toEqual(['기존 글 리라이트']);
  });

  test('결정의 네 형식', () => {
    expect(parseTopicHints('무한 스크롤 (spacehome, react-router)')).toEqual({
      terms: ['spacehome', 'react-router'],
      period: null,
    });
    expect(parseTopicHints('벤더 정산 (vendor manager, 2024.03)')).toEqual({
      terms: ['vendor manager'],
      period: '2024-03',
    });
    expect(parseTopicHints('콘솔 공유 (spacehome + vendor manager)')).toEqual({
      terms: ['spacehome', 'vendor manager'],
      period: null,
    });
    expect(parseTopicHints('회고 (2024.07)')).toEqual({ terms: [], period: '2024-07' });
  });

  test('힌트가 없으면 빈 값, 전각 괄호·여러 묶음·공백 정리·중복(대소문자) 제거, 기간은 첫 것만', () => {
    expect(parseTopicHints('그냥 제목')).toEqual({ terms: [], period: null });
    expect(parseTopicHints('제목 （SpaceHome， 2024.07 ~ 2024.09） (spacehome + Nest)')).toEqual({
      terms: ['SpaceHome', 'Nest'],
      period: '2024-07~2024-09',
    });
    expect(
      parseTopicHints('제목 (SpaceHome, 2024.07 ~ 2024.09) (spacehome + Nest, 2025.01)'),
    ).toEqual({
      terms: ['SpaceHome', 'Nest'],
      period: '2024-07~2024-09',
    });
    expect(parseTopicHints('PG사 무중단 전환기 (Toss → NicePay)')).toEqual({
      terms: ['Toss', 'NicePay'],
      period: null,
    });
  });

  test('슬래시는 항의 일부(경로·버전·A/B), `2024/12`는 기간이 아니라 키워드', () => {
    expect(parseTopicHints('x (A/B 테스트, next 13/14, src/app, 2024/12)')).toEqual({
      terms: ['A/B 테스트', 'next 13/14', 'src/app', '2024/12'],
      period: null,
    });
  });

  test('빈 괄호·짝 안 맞는 괄호·중첩·기간 둘', () => {
    expect(parseTopicHints('x () (  ) (a')).toEqual({ terms: [], period: null });
    // 중첩은 normalizeTopicTitle과 같은 범위로 본다(첫 닫는 괄호까지)
    expect(parseTopicHints('x (a (b) c)')).toEqual({ terms: ['a (b'], period: null });
    // 둘째 기간은 버린다 — 여러 달은 범위(2024.07~2024.09)로 적는다
    expect(parseTopicHints('x (2024.07, 2024.09)')).toEqual({ terms: [], period: '2024-07' });
  });

  test('isPeriodHint: 연(19xx·20xx)·연.월(1~12)·범위, 구분자 . -', () => {
    for (const ok of [
      '2024',
      '2024.03',
      '2024-3',
      '2024.12',
      '2024.07~2024.09',
      '2024.07 – 2025.01',
      '2024-2025',
    ])
      expect(isPeriodHint(ok), ok).toBe(true);
    for (const no of [
      '24.03',
      '2024.13',
      '2024.00',
      '2024.13a',
      '1000',
      'v2024',
      '2024.03.15',
      '2024/12',
      'react-router',
    ])
      expect(isPeriodHint(no), no).toBe(false);
  });

  test('normalizePeriodHint: 월 0패딩·구분자 통일·범위는 ~', () => {
    expect(normalizePeriodHint('2024')).toBe('2024');
    expect(normalizePeriodHint('2024.3')).toBe('2024-03');
    expect(normalizePeriodHint('2024-12')).toBe('2024-12');
    expect(normalizePeriodHint('2024.07 – 2025.1')).toBe('2024-07~2025-01');
    expect(normalizePeriodHint('2024-2025')).toBe('2024~2025');
    expect(normalizePeriodHint('2024-10-2025-01')).toBe('2024-10~2025-01');
    expect(normalizePeriodHint('2024/12')).toBeUndefined();
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

  test('alias가 두 리포에 겹치면 목록의 앞 리포가 이긴다(호출자가 생성 순으로 넘긴다), 한글 alias·NFC', () => {
    const shared = [
      { name: 'a', aliases: ['shared'] },
      { name: 'b', aliases: ['SHARED', '스페이스홈'] },
    ];
    expect(resolveTopicHints({ terms: ['shared'], period: null }, shared).repoNames).toEqual(['a']);
    expect(
      resolveTopicHints({ terms: ['shared'], period: null }, [...shared].reverse()).repoNames,
    ).toEqual(['b']);
    expect(
      resolveTopicHints({ terms: ['스페이스홈'.normalize('NFD')], period: null }, shared).repoNames,
    ).toEqual(['b']);
  });

  test('등록된 리포가 없으면 전부 키워드', () => {
    expect(resolveTopicHints({ terms: ['spacehome', 'Nest'], period: null }, [])).toEqual({
      repoNames: [],
      keywords: ['spacehome', 'nest'],
      period: null,
    });
  });
});

describe('isAlreadyPublished', () => {
  test('맨 앞 괄호의 첫 항이 기존 글이면 참(메모가 붙어도)', () => {
    expect(isAlreadyPublished('(기존 글) 세션')).toBe(true);
    expect(isAlreadyPublished('（기존  글, 2025） 세션')).toBe(true);
  });

  test('맨 앞이 아니거나 다른 항의 일부면 거짓', () => {
    expect(isAlreadyPublished('세션 (기존 글)')).toBe(false);
    expect(isAlreadyPublished('(2025, 기존 글) 세션')).toBe(false);
    expect(isAlreadyPublished('(기존 글 리라이트) 세션')).toBe(false);
    expect(isAlreadyPublished('세션')).toBe(false);
  });
});
