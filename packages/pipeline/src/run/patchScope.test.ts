import { describe, test, expect } from 'vitest';
import {
  checkPatchPlaces,
  checkPatchScope,
  coverChangedParagraphs,
  diffParagraphs,
  paragraphHunks,
} from './patchScope.ts';

/** 문단 여섯 개(0~5)짜리 글. */
const P = ['# 제목', '하나', '둘', '셋', '```ts\nconst a = 1;\n\nconst b = 2;\n```', '다섯'];
const doc = (paragraphs: readonly string[]) => `${paragraphs.join('\n\n')}\n`;
const BEFORE = doc(P);
const replace = (index: number, ...next: string[]) =>
  doc([...P.slice(0, index), ...next, ...P.slice(index + 1)]);

describe('diffParagraphs', () => {
  test('같은 글은 바뀐 것이 없다 — 줄 끝 공백·문단 사이 빈 줄 수·끝 개행은 무시', () => {
    expect(diffParagraphs(BEFORE, BEFORE)).toEqual({ changed: [], inserted: [] });
    expect(diffParagraphs(BEFORE, P.map((p) => `${p}  `).join('\n\n\n'))).toEqual({
      changed: [],
      inserted: [],
    });
  });

  test('한 문단을 고치면 그 번호가 changed, 새 내용은 그 자리의 inserted', () => {
    expect(diffParagraphs(BEFORE, replace(2, '둘 고침'))).toEqual({
      changed: [2],
      inserted: [{ after: 1, before: 3, count: 1 }],
    });
  });

  test('없앤 문단·끼워 넣은 문단·맨 앞·맨 뒤', () => {
    expect(diffParagraphs(BEFORE, doc([...P.slice(0, 3), ...P.slice(4)]))).toEqual({
      changed: [3],
      inserted: [],
    });
    expect(
      diffParagraphs(BEFORE, doc([...P.slice(0, 2), '새 문단', '또 새', ...P.slice(2)])),
    ).toEqual({ changed: [], inserted: [{ after: 1, before: 2, count: 2 }] });
    expect(diffParagraphs(BEFORE, doc(['머리', ...P, '꼬리']))).toEqual({
      changed: [],
      inserted: [
        { after: -1, before: 0, count: 1 },
        { after: 5, before: 6, count: 1 },
      ],
    });
  });

  test('코드 펜스 안의 한 줄만 바뀌어도 그 문단이 바뀐 것, 문단 순서를 바꾸면 한쪽은 없어지고 다른 쪽에 생긴다', () => {
    expect(diffParagraphs(BEFORE, replace(4, P[4]!.replace('b = 2', 'b = 3'))).changed).toEqual([
      4,
    ]);
    const swapped = doc([P[0]!, P[2]!, P[1]!, ...P.slice(3)]);
    const diff = diffParagraphs(BEFORE, swapped);
    expect(diff.changed).toHaveLength(1);
    expect(diff.inserted).toHaveLength(1);
  });

  test('빈 글끼리·빈 글에서 생긴 글', () => {
    expect(diffParagraphs('', '')).toEqual({ changed: [], inserted: [] });
    expect(diffParagraphs('', '가\n\n나')).toEqual({
      changed: [],
      inserted: [{ after: -1, before: 0, count: 2 }],
    });
    expect(diffParagraphs('가\n\n나', '')).toEqual({ changed: [0, 1], inserted: [] });
  });
});

describe('checkPatchScope', () => {
  test('앵커 문단과 그 앞뒤 1문단만 바뀌면 통과', () => {
    for (const index of [1, 2, 3])
      expect(checkPatchScope(BEFORE, replace(index, `${P[index]} 고침`), [2]).ok, `${index}`).toBe(
        true,
      );
    // 앵커 문단을 둘로 쪼개거나 없애도 범위 안이다.
    expect(checkPatchScope(BEFORE, replace(2, '둘-1', '둘-2'), [2]).ok).toBe(true);
    expect(checkPatchScope(BEFORE, doc([...P.slice(0, 2), ...P.slice(3)]), [2]).ok).toBe(true);
    // 아무것도 안 바뀐 글도 통과(반영 여부는 이 검사의 일이 아니다).
    expect(checkPatchScope(BEFORE, BEFORE, [2])).toEqual({
      ok: true,
      diff: { changed: [], inserted: [] },
    });
  });

  test('범위 밖 문단이 하나라도 바뀌면 PATCH_OUT_OF_SCOPE — 밖의 문단 번호를 돌려준다', () => {
    const next = doc(['# 제목 고침', P[1]!, '둘 고침', P[3]!, P[4]!, '다섯 고침']);
    expect(checkPatchScope(BEFORE, next, [2])).toMatchObject({
      ok: false,
      code: 'PATCH_OUT_OF_SCOPE',
      outside: [0, 5],
    });
    // 통째로 다시 쓴 글 — 앵커 주변만 빼고 전부 밖.
    expect(checkPatchScope(BEFORE, doc(['전혀', '다른', '글']), [2])).toMatchObject({
      ok: false,
      outside: [0, 4, 5],
    });
  });

  test('앵커가 여럿이면 각 범위의 합집합, 앵커가 없으면 어떤 변경도 범위 밖', () => {
    const next = doc([P[0]!, '하나 고침', P[2]!, P[3]!, P[4]!, '다섯 고침']);
    expect(checkPatchScope(BEFORE, next, [1, 5]).ok).toBe(true);
    expect(checkPatchScope(BEFORE, next, [1])).toMatchObject({ ok: false, outside: [5] });
    expect(checkPatchScope(BEFORE, next, [])).toMatchObject({ ok: false, outside: [1, 5] });
  });

  test('순수하게 끼워 넣은 문단은 바로 앞이나 뒤 문단이 범위 안일 때만', () => {
    const insertAfter = (index: number) =>
      doc([...P.slice(0, index + 1), '새 문단', ...P.slice(index + 1)]);
    expect(checkPatchScope(BEFORE, insertAfter(3), [2]).ok).toBe(true); // 3과 4 사이 — 3이 범위 안
    expect(checkPatchScope(BEFORE, insertAfter(0), [2]).ok).toBe(true); // 0과 1 사이 — 1이 범위 안
    expect(checkPatchScope(BEFORE, insertAfter(4), [2])).toMatchObject({ ok: false, outside: [4] });
    expect(checkPatchScope(BEFORE, doc(['머리', ...P]), [2])).toMatchObject({
      ok: false,
      outside: [0],
    });
    expect(checkPatchScope(BEFORE, doc([...P, '꼬리']), [5]).ok).toBe(true);
  });

  test('반경을 바꿀 수 있다', () => {
    const next = replace(4, '코드 없앰');
    expect(checkPatchScope(BEFORE, next, [2]).ok).toBe(false);
    expect(checkPatchScope(BEFORE, next, [2], 2).ok).toBe(true);
    expect(checkPatchScope(BEFORE, replace(3, '셋 고침'), [2], 0).ok).toBe(false);
  });
});

describe('paragraphHunks', () => {
  test('같은 글은 바뀐 곳이 없다', () => {
    expect(paragraphHunks(BEFORE, `${BEFORE}\n\n`)).toEqual([]);
  });

  test('바뀐 곳마다 없어진 문단과 그 자리에 생긴 문단을 원문으로 돌려준다', () => {
    const next = doc(['# 제목', '하나', '둘 고침', '둘 덧붙임', '셋', P[4]!, '다섯', '꼬리']);
    expect(paragraphHunks(BEFORE, next)).toEqual([
      { at: 2, removed: ['둘'], added: ['둘 고침', '둘 덧붙임'] },
      { at: 6, removed: [], added: ['꼬리'] },
    ]);
  });

  test('없어지기만 한 문단·끼워 넣기만 한 문단', () => {
    expect(paragraphHunks(BEFORE, doc([...P.slice(0, 3), ...P.slice(4)]))).toEqual([
      { at: 3, removed: ['셋'], added: [] },
    ]);
    expect(paragraphHunks(BEFORE, doc(['머리', ...P]))).toEqual([
      { at: 0, removed: [], added: ['머리'] },
    ]);
  });
});

describe('checkPatchPlaces — 앵커를 모르는 글의 범위 검사', () => {
  test('바뀐 문단을 앵커 ±1 창으로 묶는다', () => {
    expect(coverChangedParagraphs(BEFORE, BEFORE)).toEqual([]);
    expect(coverChangedParagraphs(BEFORE, replace(2, '둘 고침'))).toEqual([3]);
    // 1·2·3은 한 창, 5는 다른 창.
    const wide = doc(['# 제목', '하나 고침', '둘 고침', '셋 고침', P[4]!, '다섯 고침']);
    expect(coverChangedParagraphs(BEFORE, wide)).toEqual([2, 6]);
  });

  test('바뀐 곳이 허용 수 이하면 통과, 넘으면 범위 밖', () => {
    const one = replace(2, '둘 고침');
    const two = doc(['# 제목 고침', '하나', '둘', '셋', P[4]!, '다섯 고침']);
    expect(checkPatchPlaces(BEFORE, BEFORE, 0)).toEqual({ ok: true, places: 0 });
    expect(checkPatchPlaces(BEFORE, one, 1)).toEqual({ ok: true, places: 1 });
    expect(checkPatchPlaces(BEFORE, two, 1)).toEqual({
      ok: false,
      code: 'PATCH_OUT_OF_SCOPE',
      places: 2,
    });
    expect(checkPatchPlaces(BEFORE, two, 2).ok).toBe(true);
  });

  test('통째로 다시 쓴 글은 한 곳으로 통과하지 못한다', () => {
    const rewritten = doc(P.map((text) => `${text} 다시`));
    expect(checkPatchPlaces(BEFORE, rewritten, 1)).toMatchObject({ ok: false, places: 2 });
  });
});
