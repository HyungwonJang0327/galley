import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseQueue, serializeQueue } from './queueFile.ts';

// 실제 주제_큐.md의 시리즈 구조(정의 7·편 없는 시리즈·(기존 글) 편·완료 줄 태그+URL·줄 끝 탭)를 본뜬 합성 픽스처.
// 실제 파일은 리포에 넣지 않는다(주제 제목에 개인·실무 정보가 있다).
const raw = readFileSync(new URL('./__fixtures__/series.md', import.meta.url), 'utf8');

describe('주제_큐.md 시리즈 라운드트립 (픽스처)', () => {
  test('parse→write가 바이트 동일하다', () => {
    expect(serializeQueue(parseQueue(raw))).toBe(raw);
  });

  test('정의 줄 7개와 태그 편 줄을 모두 읽는다', () => {
    const q = parseQueue(raw);
    expect(q.seriesDefs.map((d) => d.key)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

    const tagged = Object.values(q.sections)
      .flat()
      .filter((t) => t.series !== undefined);
    expect(tagged).toHaveLength(18);
    expect(tagged.every((t) => !/^\[[A-Z]-\d/.test(t.title))).toBe(true);
  });

  test('정의 줄의 ja: 메모와 편 없는 시리즈를 보존한다', () => {
    const q = parseQueue(raw);
    expect(q.seriesDefs.find((d) => d.key === 'G')?.note).toBe('예정, ja: デザインシステム');
    const d = q.seriesDefs.find((def) => def.key === 'D');
    const e = q.seriesDefs.find((def) => def.key === 'E');
    expect(d?.position).toBe(e?.position);
  });
});
