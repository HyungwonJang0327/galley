import { describe, test, expect } from 'vitest';
import {
  buildIllustrationJaPrompt,
  buildIllustrationPrompt,
  countBodyChars,
  illustrationArtifact,
  illustrationCountFor,
  parseIllustrationManifest,
  parseIllustrationOutput,
  parseIllustrationSlots,
  planIllustrations,
  renderIllustrationBlocks,
  renderIllustrationManifest,
} from './illustration.ts';

const SVG = (label: string) =>
  `<svg width="1200" height="520" viewBox="0 0 1200 520" xmlns="http://www.w3.org/2000/svg"><text x="600" y="490">${label}</text></svg>`;
const LIMITS = { illustrationBodyChars: 24_000, illustrationZennChars: 12_000 };

describe('parseIllustrationSlots', () => {
  test('본문 자리 주석에서 이름·위치를 읽고 번호는 나온 순서로 매긴다', () => {
    const body = [
      '# 제목',
      '<!-- [삽화] illust1_post_table_split.png — 여기: 표 다음, "## 2." 앞 -->',
      '본문',
      '<!-- [삽화] illust2_cursor_pagination.png — 여기: 삽질 기록 마지막 문단 다음,\n "## 결과" 앞 -->',
    ].join('\n');
    expect(parseIllustrationSlots(body)).toEqual([
      { n: 1, name: 'illust1_post_table_split', where: '표 다음, "## 2." 앞' },
      {
        n: 2,
        name: 'illust2_cursor_pagination',
        where: '삽질 기록 마지막 문단 다음, "## 결과" 앞',
      },
    ]);
  });

  test('한글 이름·위치 설명 없는 주석도 읽고, 같은 이름은 한 번만, 최대 3장', () => {
    const body = [
      '<!-- [삽화] illust1_두_타입_한_피드.png -->',
      '<!-- [삽화] illust1_두_타입_한_피드.png — 여기: 중복 -->',
      '<!-- [삽화] illust3_b.png -->',
      '<!-- [삽화] illust4_c.png -->',
      '<!-- [삽화] illust5_d.png -->',
    ].join('\n');
    expect(parseIllustrationSlots(body)).toEqual([
      { n: 1, name: 'illust1_두_타입_한_피드' },
      { n: 2, name: 'illust3_b' },
      { n: 3, name: 'illust4_c' },
    ]);
  });

  test('삽화 주석이 아닌 것·illust로 시작하지 않는 이름·경로가 섞인 이름은 버리거나 다듬는다', () => {
    expect(parseIllustrationSlots('<!-- [확인 필요] 수치 -->\n<!-- [삽화] thumb.png -->')).toEqual(
      [],
    );
    // 경로 구분자는 파일 이름에서 빠진다 — 폴더 밖을 가리키지 못한다.
    expect(parseIllustrationSlots('<!-- [삽화] illust1_../../etc.png -->')).toEqual([
      { n: 1, name: 'illust1_....etc' },
    ]);
    // Zenn 쪽 주석([挿絵])은 벨로그 본문의 자리가 아니다.
    expect(parseIllustrationSlots('<!-- [挿絵] illust1_a_ja.png -->')).toEqual([]);
  });
});

describe('분량 규칙', () => {
  test('코드 블록·주석·공백을 빼고 센다', () => {
    const body = '가나 다\n\n```ts\nconst x = 1;\n```\n<!-- [삽화] illust1_a.png -->\n라마\n';
    expect(countBodyChars(body)).toBe(5);
  });

  test('2,000자 미만 1장 / 2,000~3,000자 2장 / 3,000자 초과 3장', () => {
    expect(illustrationCountFor(1999)).toBe(1);
    expect(illustrationCountFor(2000)).toBe(2);
    expect(illustrationCountFor(3000)).toBe(2);
    expect(illustrationCountFor(3001)).toBe(3);
  });

  test('자리 주석이 있으면 그것, 없으면 분량 규칙으로 번호만', () => {
    expect(planIllustrations('<!-- [삽화] illust1_a.png -->')).toEqual([
      { n: 1, name: 'illust1_a' },
    ]);
    expect(planIllustrations('가'.repeat(2500))).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe('buildIllustrationPrompt', () => {
  test('이름이 정해진 목록은 이름·자리를, 수정 지시와 본문(상한까지)을 싣는다', () => {
    const { system, prompt } = buildIllustrationPrompt(
      {
        body: 'x'.repeat(30),
        slots: [
          { n: 1, name: 'illust1_a', where: '표 다음' },
          { n: 2, name: 'illust2_b' },
        ],
        instruction: ' 2번을 단순하게 ',
      },
      { illustrationBodyChars: 10 },
    );
    expect(system).toContain('1200×520');
    expect(system).toContain('url(#soft)');
    expect(prompt).toContain('- 1번: illust1_a — 자리: 표 다음');
    expect(prompt).toContain('- 2번: illust2_b\n');
    expect(prompt).toContain('# 수정 지시(재실행)\n2번을 단순하게\n');
    expect(prompt).toContain(`# 벨로그 본문\n${'x'.repeat(10)}\n\n(이하 생략)`);
  });

  test('이름이 없는 목록은 장수와 위치 원칙을 싣고 수정 지시 절은 없다', () => {
    const { prompt } = buildIllustrationPrompt(
      { body: '본문', slots: [{ n: 1 }, { n: 2 }] },
      LIMITS,
    );
    expect(prompt).toContain('삽화 2장을 그립니다. 위치 원칙:');
    expect(prompt).toContain('- 1번\n- 2번\n');
    expect(prompt).not.toContain('수정 지시');
  });
});

describe('parseIllustrationOutput', () => {
  test('구분 줄로 나눠 번호별 SVG를 거르고, 정해진 이름을 쓴다(앞뒤 글자·펜스·스크립트 제거)', () => {
    const text = [
      '설명 문장',
      '===ILLUST 1: 아무_이름===',
      '```svg',
      SVG('하나').replace('<text', '<script>x()</script><text'),
      '```',
      '=== ILLUST 9 ===',
      ' ===ILLUST 2===',
      SVG('둘'),
    ].join('\n');
    expect(
      parseIllustrationOutput(text, [
        { n: 1, name: 'illust1_a' },
        { n: 2, name: 'illust2_b' },
      ]),
    ).toEqual([
      { n: 1, name: 'illust1_a', svg: SVG('하나').replace('"490">', '"490">') },
      { n: 2, name: 'illust2_b', svg: SVG('둘') },
    ]);
  });

  test('이름이 없던 목록은 구분 줄의 설명으로 이름을 만든다(파일 이름으로 다듬고 illustN_·확장자 중복 제거)', () => {
    const text = `===ILLUST 1: 두 타입 한 피드===\n${SVG('a')}\n===ILLUST 2: illust2_cursor.png===\n${SVG('b')}\n===ILLUST 3===\n${SVG('c')}`;
    expect(
      parseIllustrationOutput(text, [{ n: 1 }, { n: 2 }, { n: 3 }])?.map((d) => d.name),
    ).toEqual(['illust1_두_타입_한_피드', 'illust2_cursor', 'illust3']);
  });

  test('번호가 하나라도 빠지거나 svg 요소가 없으면 undefined, 같은 번호는 첫 블록', () => {
    const slots = [{ n: 1 }, { n: 2 }];
    expect(parseIllustrationOutput(`===ILLUST 1: a===\n${SVG('a')}`, slots)).toBeUndefined();
    expect(
      parseIllustrationOutput(
        `===ILLUST 1: a===\n${SVG('a')}\n===ILLUST 2: b===\n그림 없음`,
        slots,
      ),
    ).toBeUndefined();
    expect(parseIllustrationOutput(SVG('a'), [{ n: 1 }])).toBeUndefined();
    expect(
      parseIllustrationOutput(`===ILLUST 1: a===\n${SVG('첫')}\n===ILLUST 1: b===\n${SVG('둘')}`, [
        { n: 1 },
      ]),
    ).toEqual([{ n: 1, name: 'illust1_a', svg: SVG('첫') }]);
  });
});

describe('일본어 캡션판 프롬프트', () => {
  test('한국어 삽화를 같은 구분 줄 형식으로 싣고(이름에서 illustN_ 제외) Zenn 기사는 상한까지', () => {
    const drawings = [
      { n: 1, name: 'illust1_a', svg: SVG('하나') },
      { n: 2, name: 'illust2_b', svg: SVG('둘') },
    ];
    expect(renderIllustrationBlocks(drawings)).toBe(
      `===ILLUST 1: a===\n${SVG('하나')}\n\n===ILLUST 2: b===\n${SVG('둘')}`,
    );
    const { system, prompt } = buildIllustrationJaPrompt(
      { drawings, zenn: 'z'.repeat(20) },
      { illustrationZennChars: 5 },
    );
    expect(system).toContain('글자만');
    expect(prompt).toContain('===ILLUST 2: b===');
    expect(prompt).toContain(`# Zenn 기사(용어 참고)\nzzzzz\n\n(이하 생략)`);
    // 일본어판 출력은 한국어판과 같은 파서·같은 이름으로 읽힌다.
    expect(
      parseIllustrationOutput(renderIllustrationBlocks(drawings), [
        { n: 1, name: 'illust1_a' },
        { n: 2, name: 'illust2_b' },
      ]),
    ).toEqual(drawings);
  });
});

describe('목록 파일', () => {
  test('쓰고 다시 읽는다 — 자리 설명은 있을 때만', () => {
    const text = renderIllustrationManifest(
      [
        { n: 1, name: 'illust1_a', svg: SVG('a') },
        { n: 2, name: 'illust2_b', svg: SVG('b') },
      ],
      [{ n: 1, name: 'illust1_a', where: '표 다음' }, { n: 2 }],
    );
    expect(parseIllustrationManifest(text)).toEqual({
      version: 1,
      items: [
        { n: 1, name: 'illust1_a', where: '표 다음' },
        { n: 2, name: 'illust2_b' },
      ],
    });
    expect(text).not.toContain('<svg');
  });

  test('형태가 어긋나면 undefined, 이름은 파일 이름으로 다시 다듬는다', () => {
    expect(parseIllustrationManifest('{ nope')).toBeUndefined();
    expect(parseIllustrationManifest('{"items":{}}')).toBeUndefined();
    expect(parseIllustrationManifest('{"items":[{"n":4,"name":"a"}]}')).toBeUndefined();
    expect(parseIllustrationManifest('{"items":[{"n":1,"name":" "}]}')).toBeUndefined();
    expect(parseIllustrationManifest('{"items":[{"n":1,"name":"../x/illust1"}]}')?.items).toEqual([
      { n: 1, name: 'xillust1' },
    ]);
  });
});

test('DATA_DIR 산출물 이름은 번호 고정', () => {
  expect(illustrationArtifact(1, 'ko', 'svg')).toBe('illust1.svg');
  expect(illustrationArtifact(2, 'ja', 'png')).toBe('illust2_ja.png');
});
