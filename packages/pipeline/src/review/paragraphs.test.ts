import { describe, test, expect } from 'vitest';
import { paragraphIndexAtLine, splitParagraphs } from './paragraphs.ts';

const BODY = [
  '# 제목', // 1
  '', // 2
  '첫 문단 첫 줄', // 3
  '첫 문단 둘째 줄', // 4
  '', // 5
  '', // 6
  '```ts', // 7
  'const a = 1;', // 8
  '', // 9
  'const b = 2;', // 10
  '```', // 11
  '', // 12
  '<!-- [삽화] illust1_a.png -->', // 13
  '', // 14
  '마지막 문단', // 15
  '', // 16
].join('\n');

describe('splitParagraphs', () => {
  test('빈 줄로 나누고 줄 번호는 1부터 — 코드 펜스는 안의 빈 줄과 함께 한 문단', () => {
    expect(splitParagraphs(BODY)).toEqual([
      { index: 0, startLine: 1, endLine: 1, text: '# 제목' },
      { index: 1, startLine: 3, endLine: 4, text: '첫 문단 첫 줄\n첫 문단 둘째 줄' },
      { index: 2, startLine: 7, endLine: 11, text: '```ts\nconst a = 1;\n\nconst b = 2;\n```' },
      { index: 3, startLine: 13, endLine: 13, text: '<!-- [삽화] illust1_a.png -->' },
      { index: 4, startLine: 15, endLine: 15, text: '마지막 문단' },
    ]);
  });

  test('빈 본문·공백뿐인 본문은 문단이 없고, CRLF는 LF로 본다', () => {
    expect(splitParagraphs('')).toEqual([]);
    expect(splitParagraphs('\n  \n\t\n')).toEqual([]);
    expect(splitParagraphs('가\r\n\r\n나').map((p) => p.text)).toEqual(['가', '나']);
  });

  test('펜스는 같은 문자·같거나 더 긴 줄로만 닫힌다, 닫히지 않으면 끝까지 한 문단', () => {
    const nested = ['````md', '```ts', 'x', '```', '', '````', '', '뒤'].join('\n');
    expect(splitParagraphs(nested).map((p) => p.text)).toEqual([
      '````md\n```ts\nx\n```\n\n````',
      '뒤',
    ]);
    const tilde = ['~~~', '```', '', '~~~', '', '뒤'].join('\n');
    expect(splitParagraphs(tilde)).toHaveLength(2);
    expect(splitParagraphs('앞\n\n```ts\nx\n\ny\n\n')).toEqual([
      { index: 0, startLine: 1, endLine: 1, text: '앞' },
      { index: 1, startLine: 3, endLine: 6, text: '```ts\nx\n\ny' },
    ]);
  });

  test('문단에 붙어 시작한 펜스는 그 문단에 속한다', () => {
    expect(splitParagraphs('설명:\n```\na\n\nb\n```\n\n뒤').map((p) => p.text)).toEqual([
      '설명:\n```\na\n\nb\n```',
      '뒤',
    ]);
  });
});

describe('paragraphIndexAtLine', () => {
  test('줄이 든 문단, 문단 사이 빈 줄이면 바로 앞 문단, 범위를 벗어나면 양끝 문단', () => {
    const paragraphs = splitParagraphs(BODY);
    expect(paragraphIndexAtLine(paragraphs, 4)).toBe(1);
    expect(paragraphIndexAtLine(paragraphs, 9)).toBe(2);
    expect(paragraphIndexAtLine(paragraphs, 12)).toBe(2);
    expect(paragraphIndexAtLine(paragraphs, 0)).toBe(0);
    expect(paragraphIndexAtLine(paragraphs, 99)).toBe(4);
    expect(paragraphIndexAtLine([], 1)).toBeUndefined();
  });
});
