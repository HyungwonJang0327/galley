import { describe, it, expect } from 'vitest';
import { parseRunView, runsHref } from './run-view';

describe('parseRunView', () => {
  it('비어 있으면 진행 중 탭, 필터 없음', () => {
    expect(parseRunView({})).toEqual({
      filter: { tab: 'active' },
      selectedId: undefined,
    });
  });

  it('?tab=done&pending=1&q=스크롤&id=run_1', () => {
    expect(parseRunView({ tab: 'done', pending: '1', q: '스크롤', id: 'run_1' })).toEqual({
      filter: { tab: 'done', pendingOnly: true, query: '스크롤' },
      selectedId: 'run_1',
    });
  });

  it('모르거나 없는 tab은 active', () => {
    expect(parseRunView({ tab: 'zzz' }).filter.tab).toBe('active');
    expect(parseRunView({ tab: undefined }).filter.tab).toBe('active');
  });

  it('pending은 "1"만 켠다', () => {
    expect(parseRunView({ pending: '1' }).filter.pendingOnly).toBe(true);
    expect(parseRunView({ pending: 'true' }).filter.pendingOnly).toBeUndefined();
    expect(parseRunView({ pending: '0' }).filter.pendingOnly).toBeUndefined();
  });

  it('q·id는 앞뒤 공백을 자르고, 비었으면 없는 값', () => {
    expect(parseRunView({ q: '  스크롤  ', id: '  run_1  ' })).toEqual({
      filter: { tab: 'active', query: '스크롤' },
      selectedId: 'run_1',
    });
    expect(parseRunView({ q: '   ', id: '' })).toEqual({
      filter: { tab: 'active' },
      selectedId: undefined,
    });
  });

  it('같은 키가 여러 번이면 첫 값', () => {
    expect(
      parseRunView({
        tab: ['done', 'active'],
        pending: ['1', '0'],
        q: ['하나', '둘'],
        id: ['run_a', 'run_b'],
      }),
    ).toEqual({
      filter: { tab: 'done', pendingOnly: true, query: '하나' },
      selectedId: 'run_a',
    });
  });
});

describe('runsHref', () => {
  it('기본은 진행 중 탭만', () => {
    expect(runsHref({})).toBe('/runs?tab=active');
  });

  it('켜진 필터만 붙인다', () => {
    expect(
      runsHref({
        tab: 'done',
        pendingOnly: true,
        query: '스크롤',
        selectedId: 'run_1',
      }),
    ).toBe('/runs?tab=done&pending=1&q=%EC%8A%A4%ED%81%AC%EB%A1%A4&id=run_1');
  });

  it('공백 query·id와 pending false는 뺀다', () => {
    expect(runsHref({ tab: 'active', pendingOnly: false, query: '  ', selectedId: '' })).toBe(
      '/runs?tab=active',
    );
  });
});
