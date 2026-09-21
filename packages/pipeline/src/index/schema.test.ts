import { describe, test, expect } from 'vitest';
import {
  parseStringArray,
  serializeStringArray,
  validatePointers,
  parsePointers,
  serializePointers,
  isRepoStatus,
  isAnalysisKind,
  isLinkSource,
  isIndexJobKind,
  isIndexJobStatus,
} from './schema.ts';

describe('parseStringArray / serializeStringArray', () => {
  test('JSON 배열 문자열을 읽고, 깨진 값·배열 아님·비문자열 요소는 빈 배열 또는 걸러낸다', () => {
    expect(parseStringArray('["a","b"]')).toEqual(['a', 'b']);
    expect(parseStringArray('["a",1,null]')).toEqual(['a']);
    expect(parseStringArray('{"a":1}')).toEqual([]);
    expect(parseStringArray('not json')).toEqual([]);
    expect(parseStringArray(null)).toEqual([]);
    expect(parseStringArray('')).toEqual([]);
  });

  test('직렬화는 공백을 다듬고 빈 항목·중복을 없애며 순서를 지킨다', () => {
    expect(serializeStringArray([' spacehome ', '', 'react-router', 'spacehome'])).toBe(
      '["spacehome","react-router"]',
    );
    expect(parseStringArray(serializeStringArray([]))).toEqual([]);
  });
});

describe('validatePointers / parsePointers', () => {
  const good = { commit: 'abc1234', path: 'src/a.ts', lineStart: 1, lineEnd: 10, note: 'n' };

  test('포인터가 하나도 없으면 POINTERS_EMPTY', () => {
    expect(validatePointers([])).toEqual({ ok: false, code: 'POINTERS_EMPTY' });
  });

  test('commit·path가 비었거나 라인이 1 미만·정수 아님이면 POINTER_INVALID(index)', () => {
    expect(validatePointers([good, { commit: '', path: 'x' }])).toEqual({
      ok: false,
      code: 'POINTER_INVALID',
      index: 1,
    });
    expect(validatePointers([{ commit: 'a', path: 'x', lineStart: 0 }]).ok).toBe(false);
    expect(validatePointers([{ commit: 'a', path: 'x', lineEnd: 1.5 }]).ok).toBe(false);
    expect(validatePointers([{ commit: 'a', path: 'x', note: 3 }]).ok).toBe(false);
    expect(validatePointers(['string']).ok).toBe(false);
    expect(validatePointers([{ commit: 'a', path: 'x', lineStart: 5, lineEnd: 2 }])).toEqual({
      ok: false,
      code: 'POINTER_INVALID',
      index: 0,
    });
  });

  test('유효하면 그대로 돌려주고, 직렬화 → 파싱이 왕복한다. 라인 범위·note는 선택', () => {
    const minimal = { commit: 'a', path: 'x' };
    const result = validatePointers([good, minimal]);
    expect(result).toEqual({ ok: true, pointers: [good, minimal] });
    const serialized = serializePointers([good, minimal]);
    expect(serialized.ok).toBe(true);
    if (serialized.ok) expect(parsePointers(serialized.text)).toEqual([good, minimal]);
  });

  test('serializePointers는 빈 배열·잘못된 항목을 값으로 거부한다(저장 경로 차단)', () => {
    expect(serializePointers([])).toEqual({ ok: false, code: 'POINTERS_EMPTY' });
    expect(serializePointers([{ commit: '', path: 'x' }])).toEqual({
      ok: false,
      code: 'POINTER_INVALID',
      index: 0,
    });
  });

  test('parsePointers는 깨진 JSON·빈 배열·잘못된 항목을 빈 배열로 돌려준다', () => {
    expect(parsePointers('nope')).toEqual([]);
    expect(parsePointers('[]')).toEqual([]);
    expect(parsePointers('[{"commit":"a"}]')).toEqual([]);
  });
});

describe('어휘 가드', () => {
  test('DB 문자열을 어휘로 좁힌다', () => {
    expect(isRepoStatus('stale')).toBe(true);
    expect(isRepoStatus('failed')).toBe(false);
    expect(isAnalysisKind('change')).toBe(true);
    expect(isAnalysisKind('diff')).toBe(false);
    expect(isLinkSource('manual')).toBe(true);
    expect(isLinkSource('user')).toBe(false);
    expect(isIndexJobKind('incremental')).toBe(true);
    expect(isIndexJobKind('partial')).toBe(false);
    expect(isIndexJobStatus('interrupted')).toBe(true);
    expect(isIndexJobStatus('error')).toBe(false);
    // 프로토타입 키는 어휘가 아니다
    expect(isRepoStatus('toString')).toBe(false);
  });
});
