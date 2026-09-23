import { describe, test, expect } from 'vitest';
import {
  countClaims,
  extractMechanicalClaims,
  extractStatements,
  findVerbatimRuns,
  matchMechanicalClaims,
  splitBodyLines,
} from './verification.ts';
import { VERIFY_LIMITS } from './verifyLimits.ts';
import type { EvidenceBundle } from './bundle.ts';

const BUNDLE: EvidenceBundle = {
  version: 1,
  runId: 'run_1',
  topicId: 't1',
  topicSlug: 's',
  collectedAt: '2026-09-23T00:00:00.000Z',
  items: [
    {
      commit: 'abcdef1234567',
      path: 'src/scroll/useInfiniteScroll.ts',
      lineRange: { start: 10, end: 14 },
      date: '2024-03-05T10:00:00+09:00',
      note: '스토어 50개, 월 주문 1,000건 기준',
      source: 'linked',
      redacted: true,
      truncated: false,
      snippet:
        'export const PAGE_SIZE = 20;\nconst io = new IntersectionObserver(loadNextPage);\nio.observe(sentinel);\nconst timeoutMs = 300;\n}',
    },
  ],
  analyses: [
    { id: 'a1', kind: 'area', title: 'src 영역', summary: '무한 스크롤은 2024년 3월에 붙였다.' },
  ],
  unreadable: 0,
  filtered: true,
};

const BODY = `# 무한 스크롤 붙이기

스토어 50개에서 목록이 멈췄다. 월 주문은 1,000건이었고 응답은 300ms 안에 왔다. 실패율은 12%였다.
2024년 3월의 일이다. 세 가지를 바꿨다.

1. \`PAGE_SIZE\`를 20으로 두고 \`useInfiniteScroll.ts\`에서 IntersectionObserver를 썼다.
2. \`loadNextPage()\`는 \`/payments/nice/return\`으로 갔다. fetchOrders를 지웠다.

\`\`\`ts
export const PAGE_SIZE = 20;
const io = new IntersectionObserver(loadNextPage);
io.observe(sentinel);
\`\`\`

<!-- [확인 필요] 처리량은 5,000건이었다. -->
결론은 관찰자였다.
`;

describe('splitBodyLines', () => {
  test('코드 펜스 안팎을 표시하고 더 긴 펜스로 닫는다', () => {
    const lines = splitBodyLines('a\n````md\n```\nb\n```\n````\nc');
    expect(lines.map((l) => l.inCode)).toEqual([false, true, true, true, true, true, false]);
    expect(lines[6]).toEqual({ line: 7, text: 'c', inCode: false });
  });
});

describe('extractMechanicalClaims', () => {
  test('숫자(콤마·단위)·경로·식별자·인라인 백틱을 산문에서만 뽑고 목록 번호·연도·주석은 뺀다', () => {
    const claims = extractMechanicalClaims(splitBodyLines(BODY));
    const by = (kind: string) => claims.filter((c) => c.kind === kind).map((c) => c.text);
    expect(by('number')).toEqual(['50개', '1,000건', '300ms', '12%', '2024년', '20']);
    expect(by('path')).toEqual(['useInfiniteScroll.ts', '/payments/nice/return']);
    expect(by('identifier')).toEqual([
      'PAGE_SIZE',
      'IntersectionObserver',
      'loadNextPage()',
      'fetchOrders',
    ]);
    expect(claims.find((c) => c.text === '5,000건')).toBeUndefined(); // 주석 속
    expect(claims.find((c) => c.text === '2024')).toBeUndefined(); // 단위 없는 연도는 뺀다(`2024년`은 남는다)
    expect(claims.find((c) => c.text === '3')).toBeUndefined(); // "2024년 3월"의 3은 단위 '월' 없음 → 한 자리 잡음
    expect(claims.find((c) => c.text === '50개')?.line).toBe(3);
  });
});

describe('matchMechanicalClaims', () => {
  test('숫자는 supported/unsupported, 경로·식별자는 supported/uncertain, 요약에서만 맞으면 evidenceRef 없음', () => {
    const matched = matchMechanicalClaims(extractMechanicalClaims(splitBodyLines(BODY)), BUNDLE);
    const st = Object.fromEntries(matched.map((c) => [c.text, c.status]));
    expect(st).toEqual({
      '50개': 'supported',
      '1,000건': 'supported',
      '300ms': 'supported',
      '12%': 'unsupported',
      '2024년': 'supported', // 조각 date(2024-03-05)와 맞는다
      '20': 'supported',
      'useInfiniteScroll.ts': 'supported',
      '/payments/nice/return': 'uncertain',
      PAGE_SIZE: 'supported',
      IntersectionObserver: 'supported',
      'loadNextPage()': 'supported',
      fetchOrders: 'uncertain',
    });
    expect(matched.find((c) => c.text === '50개')?.evidenceRef).toEqual({
      commit: 'abcdef1234567',
      path: 'src/scroll/useInfiniteScroll.ts',
      lineRange: { start: 10, end: 14 },
    });
    expect(matched.find((c) => c.text === '12%')?.reason).toBe('not-in-evidence');
    expect(matched.find((c) => c.text === 'fetchOrders')?.reason).toContain('일반화');
    expect(countClaims(matched)).toEqual({ supported: 9, unsupported: 1, uncertain: 2 });
  });

  test('숫자는 토큰 경계로 맞춘다(1000 ≠ 10000) · 분석 글 요약에서만 맞으면 in-analysis-summary', () => {
    const bundle: EvidenceBundle = {
      ...BUNDLE,
      items: [{ ...BUNDLE.items[0]!, note: undefined, snippet: 'limit = 10000;' }],
      analyses: [{ id: 'a', kind: 'area', title: 't', summary: '건수는 77건' }],
    };
    const claims = extractMechanicalClaims(splitBodyLines('한도는 1,000건이고 77건을 처리했다.'));
    const m = matchMechanicalClaims(claims, bundle);
    expect(m.find((c) => c.text === '1,000건')?.status).toBe('unsupported');
    expect(m.find((c) => c.text === '77건')).toMatchObject({
      status: 'supported',
      reason: 'in-analysis-summary',
    });
    expect(m.find((c) => c.text === '77건')?.evidenceRef).toBeUndefined();
  });
});

describe('extractStatements', () => {
  test('"~다."로 끝나는 산문 문장만, 제목·주석·코드 제외, 길이 상한 적용, 중복 제거', () => {
    const s = extractStatements(splitBodyLines(BODY));
    expect(s.map((c) => c.text)).toEqual([
      '스토어 50개에서 목록이 멈췄다.',
      '월 주문은 1,000건이었고 응답은 300ms 안에 왔다.',
      '실패율은 12%였다.',
      '2024년 3월의 일이다.',
      '세 가지를 바꿨다.',
      '`PAGE_SIZE`를 20으로 두고 `useInfiniteScroll.ts`에서 IntersectionObserver를 썼다.',
      '`loadNextPage()`는 `/payments/nice/return`으로 갔다.',
      'fetchOrders를 지웠다.',
      '결론은 관찰자였다.',
    ]);
    expect(s[0]).toMatchObject({ kind: 'statement', status: 'uncertain', line: 3 });
    // 최소 길이를 올리면 짧은 문장("세 가지를 바꿨다." 9자)이 빠진다
    expect(
      extractStatements(splitBodyLines(BODY), { ...VERIFY_LIMITS, statementMinChars: 12 }).map(
        (c) => c.text,
      ),
    ).not.toContain('세 가지를 바꿨다.');
  });
});

describe('findVerbatimRuns', () => {
  test('조각의 3줄 이상이 본문에 연속으로 그대로 있으면 위치·줄 수만 기록한다(텍스트 없음)', () => {
    const runs = findVerbatimRuns(splitBodyLines(BODY), BUNDLE);
    expect(runs).toEqual([
      {
        evidenceRef: {
          commit: 'abcdef1234567',
          path: 'src/scroll/useInfiniteScroll.ts',
          lineRange: { start: 10, end: 14 },
        },
        bodyLine: 10,
        snippetLine: 10,
        lines: 3,
      },
    ]);
    expect(JSON.stringify(runs)).not.toContain('IntersectionObserver');
  });

  test('2줄만 겹치거나 짧은 줄(`}`)만 겹치면 잡지 않고, 임계값을 낮추면 잡는다', () => {
    const two =
      '```ts\nexport const PAGE_SIZE = 20;\nconst io = new IntersectionObserver(loadNextPage);\n}\n```';
    expect(findVerbatimRuns(splitBodyLines(two), BUNDLE)).toEqual([]);
    expect(
      findVerbatimRuns(splitBodyLines(two), BUNDLE, { ...VERIFY_LIMITS, cleanRoomLines: 2 }),
    ).toHaveLength(1);
  });
});
