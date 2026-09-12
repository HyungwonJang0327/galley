import { describe, it, expect } from 'vitest';
import { dropToIndex } from './queue-drag';

// 목록 [0,1,2,3] 기준. "to"는 옮긴 뒤 그 항목이 있어야 할 위치.
describe('dropToIndex', () => {
  it('위로 끌어 대상 위에 놓으면 대상 자리로 간다', () => {
    expect(dropToIndex({ from: 3, over: 1, edge: 'top' })).toBe(1);
  });

  it('위로 끌어 대상 아래에 놓으면 대상 바로 뒤로 간다', () => {
    expect(dropToIndex({ from: 3, over: 1, edge: 'bottom' })).toBe(2);
  });

  it('아래로 끌 때는 자기 자신이 빠지는 것을 반영한다', () => {
    // 0을 2 아래에 놓으면 [1,2,0,3] → 최종 위치 2
    expect(dropToIndex({ from: 0, over: 2, edge: 'bottom' })).toBe(2);
    // 0을 2 위에 놓으면 [1,0,2,3] → 최종 위치 1
    expect(dropToIndex({ from: 0, over: 2, edge: 'top' })).toBe(1);
  });

  it('맨 위·맨 아래로 옮기는 경우', () => {
    expect(dropToIndex({ from: 2, over: 0, edge: 'top' })).toBe(0);
    expect(dropToIndex({ from: 0, over: 3, edge: 'bottom' })).toBe(3);
  });

  it('제자리면 null(액션을 부르지 않는다)', () => {
    expect(dropToIndex({ from: 1, over: 1, edge: 'top' })).toBeNull();
    expect(dropToIndex({ from: 1, over: 1, edge: 'bottom' })).toBeNull();
    // 바로 아래 행의 위쪽에 놓기 = 제자리
    expect(dropToIndex({ from: 1, over: 2, edge: 'top' })).toBeNull();
    // 바로 위 행의 아래쪽에 놓기 = 제자리
    expect(dropToIndex({ from: 1, over: 0, edge: 'bottom' })).toBeNull();
  });
});
