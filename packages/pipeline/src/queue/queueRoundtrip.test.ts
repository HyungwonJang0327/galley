import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseQueue, serializeQueue } from './queueFile.ts';

// 실제 주제_큐.md 구조(서문·후보 카테고리·완료 날짜)를 본뜬 픽스처.
const raw = readFileSync(new URL('./__fixtures__/주제_큐.sample.md', import.meta.url), 'utf8');

describe('주제_큐.md 라운드트립 (픽스처)', () => {
  test('read→write→re-read가 구조상 동일하다', () => {
    const once = parseQueue(raw);
    const again = parseQueue(serializeQueue(once));
    expect(again).toEqual(once);
  });

  test('섹션 이동 수정이 write→re-read 후 유지된다', () => {
    const q = parseQueue(raw);
    const [moved, ...restCandidates] = q.sections.후보;
    if (!moved) throw new Error('픽스처에 후보 항목이 없다');

    // 사람이 UI에서 후보 → 대기로 옮기는 편집을 시뮬레이션(카테고리 벗음).
    const edited = {
      preamble: q.preamble,
      sections: {
        대기: [...q.sections.대기, { title: moved.title }],
        후보: restCandidates,
        보류: q.sections.보류,
        완료: q.sections.완료,
      },
    };

    const reread = parseQueue(serializeQueue(edited));
    expect(reread.sections.대기.at(-1)).toEqual({ title: moved.title });
    expect(reread.sections.후보).toHaveLength(q.sections.후보.length - 1);
  });

  test('완료 날짜 접두를 보존한다', () => {
    const q = parseQueue(raw);
    expect(q.sections.완료[0]).toEqual({
      title: 'PG사 무중단 전환기 (Toss → NicePay)',
      completedOn: '2026-09-06',
    });
  });
});
