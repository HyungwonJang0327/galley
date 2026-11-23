import { describe, expect, test } from 'vitest';
import { checkBodyCode, measureBodyCode } from './bodyCode.ts';

const block = (lines: number, fence = '```') =>
  [`${fence}ts`, ...Array.from({ length: lines }, (_, i) => `const v${i} = ${i};`), fence].join(
    '\n',
  );
const prose = (chars: number) => '가'.repeat(chars);

describe('measureBodyCode', () => {
  test('코드 블록의 줄 수와 코드·글 글자 수(공백 제외)를 잰다 — HTML 주석은 글이 아니다', () => {
    const body = [
      '# 제목',
      '',
      '글 한 줄.',
      '<!-- [확인 필요] 주석은 세지 않는다 — 사유 -->',
      '',
      '```ts',
      'const a = 1;',
      '',
      'const b = 2;',
      '```',
      '',
      '~~~',
      'x',
      '~~~',
      '',
    ].join('\n');

    expect(measureBodyCode(body)).toEqual({
      blockLines: [3, 1],
      codeChars: 'consta=1;constb=2;x'.length,
      proseChars: '#제목글한줄.'.length,
    });
  });

  test('펜스 안의 더 짧은 펜스는 닫는 줄이 아니고, 닫히지 않은 펜스는 끝까지 코드다', () => {
    expect(measureBodyCode('````md\n```ts\nx\n```\n````\n').blockLines).toEqual([3]);
    expect(measureBodyCode('글.\n\n```ts\na\nb\n').blockLines).toEqual([2]);
  });
});

describe('checkBodyCode', () => {
  test('상한 안이면 빈 배열', () => {
    const body = [prose(600), block(5), prose(600), block(10)].join('\n\n');
    expect(checkBodyCode(body)).toEqual([]);
  });

  test('블록 수·긴 블록·코드 비율을 각각 알린다', () => {
    const body = [prose(100), ...Array.from({ length: 5 }, () => block(20))].join('\n\n');
    expect(checkBodyCode(body)).toEqual([
      { code: 'CODE_BLOCKS_OVER', value: 5, limit: 4 },
      { code: 'CODE_BLOCK_TOO_LONG', value: 20, limit: 15, count: 5 },
      { code: 'CODE_RATIO_OVER', value: expect.any(Number), limit: 40 },
    ]);
  });

  test('상한은 바꿔 줄 수 있고, 딱 상한이면 넘은 것이 아니다', () => {
    const body = [prose(3000), block(15), block(15), block(15), block(15)].join('\n\n');
    expect(checkBodyCode(body)).toEqual([]);
    expect(checkBodyCode(body, { maxBlocks: 3, maxBlockLines: 14, maxCodePercent: 100 })).toEqual([
      { code: 'CODE_BLOCKS_OVER', value: 4, limit: 3 },
      { code: 'CODE_BLOCK_TOO_LONG', value: 15, limit: 14, count: 4 },
    ]);
  });

  test('빈 본문은 넘은 것이 없다', () => {
    expect(checkBodyCode('')).toEqual([]);
  });
});
