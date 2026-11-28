import { describe, test, expect } from 'vitest';
import { POST_SHAPE_LIMITS, checkPostShape, measurePostShape } from './postShape.ts';

const code = (lines: number, lang = 'ts') =>
  ['```' + lang, ...Array.from({ length: lines }, (_, i) => `const v${i} = ${i};`), '```'].join(
    '\n',
  );
const para = (chars: number) => '가'.repeat(chars);

describe('measurePostShape', () => {
  test('글자 수·코드 블록·인라인 코드·문단·삽화 자리·결과 절 날짜를 잰다', () => {
    const body = [
      '# 제목',
      '',
      '첫 문단이다. `useState`와 `ref`를 썼다.',
      '',
      '<!-- [삽화] illust1_flow.png — 여기: 첫 문단 다음 -->',
      '',
      '## 1. 본론',
      '',
      '둘째 문단.',
      code(3),
      '셋째 문단. 코드 안의 `백틱`은 세지 않는다.',
      '',
      '- 목록은 문단이 아니다',
      '',
      '| 표 | 도 |',
      '| --- | --- |',
      '',
      '> 인용도',
      '',
      '![그림](a.png)',
      '',
      '## 다른 절',
      '',
      '- **2024.01**: 결과 절이 아니면 세지 않는다',
      '',
      '## 결과',
      '',
      '- **2024.03**: 시작',
      '- **2024.03.07** 고침',
      '- 2024-04-01: 배포',
      '- 날짜 없는 줄',
      '',
      '잘한 건 2024.05에 끝낸 것이다.',
    ].join('\n');
    expect(measurePostShape(body)).toMatchObject({
      codeBlocks: 1,
      longestBlockLines: 3,
      inlineCodes: 3,
      paragraphs: 4, // 첫·둘째·셋째·잘한 건
      illustrationSlots: 2, // 주석 1 + 그림 1
      resultDates: 3, // 결과 절의 목록 줄만
    });
  });

  test('코드 블록 안의 것은 글·문단·인라인 코드로 세지 않고, 빈 본문은 전부 0', () => {
    const body = [
      '문단.',
      '```md',
      '## 결과',
      '- 2024.01 가짜',
      '`x`',
      '',
      '문단 아님',
      '```',
    ].join('\n');
    expect(measurePostShape(body)).toMatchObject({
      codeBlocks: 1,
      inlineCodes: 0,
      paragraphs: 1,
      resultDates: 0,
    });
    expect(measurePostShape('')).toEqual({
      proseChars: 0,
      codeBlocks: 0,
      longestBlockLines: 0,
      codePercent: 0,
      inlineCodes: 0,
      paragraphs: 0,
      illustrationSlots: 0,
      resultDates: 0,
    });
  });
});

describe('checkPostShape', () => {
  const body = (chars: number, blocks: number[]) =>
    [para(chars), ...blocks.map((n) => code(n))].join('\n\n');

  test('기준(본문 2,000~3,000자 · 코드 2~4개) 안이면 벗어난 항목이 없다 — 경계는 안쪽이다', () => {
    expect(checkPostShape(body(2000, [5, 5])).findings).toEqual([]);
    expect(checkPostShape(body(3000, [5, 5, 5, 5])).findings).toEqual([]);
  });

  test('글자 수·블록 수가 범위 밖이면 기준 밖(off)으로, 어느 쪽으로 벗어났는지 알린다', () => {
    expect(checkPostShape(body(1999, [5])).findings).toEqual([
      { code: 'PROSE_CHARS_UNDER', level: 'off', value: 1999, min: 2000, max: 3000 },
      { code: 'CODE_BLOCKS_UNDER', level: 'off', value: 1, min: 2, max: 4 },
    ]);
    expect(checkPostShape(body(3001, [5, 5, 5, 5, 5])).findings).toEqual([
      { code: 'PROSE_CHARS_OVER', level: 'off', value: 3001, min: 2000, max: 3000 },
      { code: 'CODE_BLOCKS_OVER', level: 'off', value: 5, min: 2, max: 4 },
    ]);
  });

  test('블록 길이·코드 비율은 경고(warn)로만 — 기존 글에서 가장 큰 값(49줄·47%)까지는 걸리지 않는다', () => {
    expect(checkPostShape(body(2500, [49, 5])).findings).toEqual([]);
    expect(checkPostShape(body(2500, [50, 5])).findings).toEqual([
      { code: 'CODE_BLOCK_TOO_LONG', level: 'warn', value: 50, limit: 49 },
    ]);
    const heavy = checkPostShape(body(2000, [49, 49, 49, 49]));
    expect(heavy.shape.codePercent).toBeGreaterThan(47);
    expect(heavy.findings).toEqual([
      { code: 'CODE_RATIO_OVER', level: 'warn', value: heavy.shape.codePercent, limit: 47 },
    ]);
  });

  test('상한은 바꿔 줄 수 있다', () => {
    const limits = {
      ...POST_SHAPE_LIMITS,
      proseChars: { min: 0, max: 10 },
      warnBlockLines: 2,
      warnCodePercent: 100,
    };
    expect(checkPostShape(body(11, [3, 3]), limits).findings.map((f) => f.code)).toEqual([
      'PROSE_CHARS_OVER',
      'CODE_BLOCK_TOO_LONG',
    ]);
  });
});
