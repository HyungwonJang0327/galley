import { describe, expect, test } from 'vitest';
import { measureBodyCode } from './bodyCode.ts';

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
