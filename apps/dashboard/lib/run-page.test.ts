import { describe, it, expect } from 'vitest';
import type { RunDetailView } from './run-detail';
import { pickActiveId, resolveRunPane } from './run-page';

const run = { id: 'run-1', steps: [] } as unknown as RunDetailView;

describe('pickActiveId', () => {
  it('?id=가 있으면 그것', () => {
    expect(pickActiveId([{ id: 'a' }, { id: 'b' }], 'b')).toBe('b');
  });

  it('?id=가 없으면 첫 행을 자동 선택', () => {
    expect(pickActiveId([{ id: 'a' }, { id: 'b' }], undefined)).toBe('a');
  });

  it('목록이 비면 없음', () => {
    expect(pickActiveId([], undefined)).toBeUndefined();
  });

  it('?id=는 목록에 없어도 그대로 — 필터 밖 실행도 링크로 열린다', () => {
    expect(pickActiveId([{ id: 'a' }], 'zzz')).toBe('zzz');
  });
});

describe('resolveRunPane', () => {
  it('조회 결과가 없으면(선택할 행 없음) empty', () => {
    expect(resolveRunPane(undefined)).toEqual({ kind: 'empty' });
  });

  it('성공이면 selected', () => {
    expect(resolveRunPane({ ok: true, data: run })).toEqual({ kind: 'selected', run });
  });

  it('없는 id는 실패가 아니라 empty', () => {
    expect(
      resolveRunPane({ ok: false, error: { code: 'RUN_NOT_FOUND', message: '없음' } }),
    ).toEqual({ kind: 'empty' });
  });

  it('조회 실패는 메시지와 함께 failed', () => {
    expect(
      resolveRunPane({ ok: false, error: { code: 'RUN_DETAIL_FAILED', message: '깨짐' } }),
    ).toEqual({ kind: 'failed', message: '깨짐' });
  });
});
