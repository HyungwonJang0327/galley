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
    expect(lines[6]).toEqual({ line: 7, text: 'c', inCode: false, inComment: false });
  });
});

describe('extractMechanicalClaims', () => {
  test('숫자(콤마·단위)·경로·식별자·인라인 백틱을 산문에서만 뽑고 목록 번호·연도·주석은 뺀다', () => {
    const claims = extractMechanicalClaims(splitBodyLines(BODY));
    const by = (kind: string) => claims.filter((c) => c.kind === kind).map((c) => c.text);
    expect(by('number')).toEqual(['50개', '1,000건', '300ms', '12%', '2024년', '3월', '20']);
    expect(by('path')).toEqual(['useInfiniteScroll.ts', '/payments/nice/return']);
    expect(by('identifier')).toEqual([
      'PAGE_SIZE',
      'IntersectionObserver',
      'loadNextPage()',
      'fetchOrders',
    ]);
    expect(claims.find((c) => c.text === '5,000건')).toBeUndefined(); // 주석 속
    expect(claims.find((c) => c.text === '2024')).toBeUndefined(); // 단위 없는 연도는 뺀다(`2024년`은 남는다)
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
      '3월': 'supported', // 요약 "2024년 3월"
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
    expect(matched.find((c) => c.text === 'fetchOrders')?.reason).toBe('generalizable');
    expect(countClaims(matched)).toEqual({ supported: 10, unsupported: 1, uncertain: 2 });
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

describe('추출 경계(리뷰 반영)', () => {
  test('여러 줄 HTML 주석 속은 주장·서술에서 빠지고, 4칸 들여쓰기 코드 블록은 코드, 닫는 펜스는 info string 없이', () => {
    const body =
      '본문이다.\n<!-- [확인 필요]\n처리량은 5,000건이었다.\n-->\n뒤 문장은 이렇게 길다.\n\n    const x = 12345;\n\n1. 목록이다.\n    이어지는 목록 줄은 코드가 아니고 77개다.\n\n```ts\ncode\n```ts\n아직 코드 99개\n```\n끝이다.';
    const lines = splitBodyLines(body);
    expect(lines.filter((l) => l.inComment).map((l) => l.line)).toEqual([3, 4]);
    expect(lines.filter((l) => l.inCode).map((l) => l.line)).toEqual([7, 12, 13, 14, 15, 16]);
    const claims = extractMechanicalClaims(lines).map((c) => c.text);
    expect(claims).toEqual(['77개']);
    expect(extractStatements(lines).map((c) => c.text)).toEqual([
      '뒤 문장은 이렇게 길다.',
      '이어지는 목록 줄은 코드가 아니고 77개다.',
    ]);
  });

  test('날짜·시간·버전은 조각내지 않는다 — ISO 날짜는 통째, 시간·버전은 뺀다, 월 단위는 잡는다', () => {
    const claims = extractMechanicalClaims(
      splitBodyLines(
        '2024-03-05에 배포했다. 10:30에 멈췄고 Node 24와 next 19.2.8을 썼다. 12월에 -15도였고 10~20건이었다.',
      ),
    );
    expect(claims.filter((c) => c.kind === 'number').map((c) => c.text)).toEqual([
      '2024-03-05',
      '24',
      '12월',
      '10',
      '20건',
    ]); // 부호 뒤 숫자(-15)는 뺀다
  });

  test('조사가 붙은 경로는 확장자까지 경로로, 인자 있는 호출·Array.from 같은 멤버 접근도 식별자로', () => {
    const claims = extractMechanicalClaims(
      splitBodyLines(
        'src/app/page.tsx를 고치고 useInfiniteScroll.ts에서 getFoo(x)를 불렀다. `Array.from`과 `res.json()`을 썼다. iOS와 GitHub도 있다.',
      ),
    );
    const by = (kind: string) => claims.filter((c) => c.kind === kind).map((c) => c.text);
    expect(by('path')).toEqual(['src/app/page.tsx', 'useInfiniteScroll.ts']);
    expect(by('identifier')).toEqual(['Array.from', 'res.json()', 'getFoo()', 'iOS', 'GitHub']);
  });

  test('식별자 정규식은 대문자 연속에서 선형이다(리뷰 H2 회귀)', () => {
    const line = `use${'B'.repeat(40)}(x) 그리고 ${'ABCD'.repeat(500)}( 끝`;
    const started = performance.now();
    extractMechanicalClaims(splitBodyLines(line));
    expect(performance.now() - started).toBeLessThan(100);
  });

  test('숫자 대조 경계: 20 ≠ 20.5·120·2024, 본문 1000 ↔ 조각 1,000은 대칭, ISO 날짜는 date와', () => {
    const mk = (snippet: string, note?: string): EvidenceBundle => ({
      ...BUNDLE,
      items: [
        { ...BUNDLE.items[0]!, snippet, ...(note === undefined ? { note: undefined } : { note }) },
      ],
      analyses: [],
    });
    const st = (body: string, bundle: EvidenceBundle) =>
      Object.fromEntries(
        matchMechanicalClaims(extractMechanicalClaims(splitBodyLines(body)), bundle).map((c) => [
          c.text,
          c.status,
        ]),
      );
    expect(st('값은 20이다.', mk('x = 20.5; y = 120; z = 2024;'))).toEqual({ '20': 'unsupported' });
    expect(st('값은 1000건이다.', mk('limit = 1,000'))).toEqual({ '1000건': 'supported' });
    expect(st('값은 1,000건이다.', mk('limit = 1000'))).toEqual({ '1,000건': 'supported' });
    expect(st('2024-03-05에 배포했다.', mk('nothing'))).toEqual({ '2024-03-05': 'supported' }); // item.date
    expect(st('2024-04-01에 배포했다.', mk('nothing'))).toEqual({ '2024-04-01': 'unsupported' });
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

  test('조각이 여럿이면 조각마다 한 건, 반복되는 줄이 있어도 가장 긴 연속 구간을 한 번만', () => {
    const rep = 'const io = new IntersectionObserver(loadNextPage);';
    const bundle: EvidenceBundle = {
      ...BUNDLE,
      items: [
        BUNDLE.items[0]!,
        {
          ...BUNDLE.items[0]!,
          path: 'src/b.ts',
          lineRange: { start: 40, end: 43 },
          snippet: `${rep}\n${rep}\n${rep}\nio.observe(sentinel);`,
        },
      ],
    };
    const runs = findVerbatimRuns(
      splitBodyLines(`\`\`\`ts\n${rep}\n${rep}\n${rep}\nio.observe(sentinel);\n\`\`\``),
      bundle,
    );
    expect(runs.map((r) => [r.evidenceRef.path, r.bodyLine, r.snippetLine, r.lines])).toEqual([
      ['src/b.ts', 2, 40, 4],
    ]);
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
