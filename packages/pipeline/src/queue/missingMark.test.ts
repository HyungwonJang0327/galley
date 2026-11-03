import { describe, it, expect } from 'vitest';
import { HOLD_REASON_REMOVED } from './importQueue.ts';
import { missingMark } from './missingMark.ts';

describe('missingMark', () => {
  it('파일에 있는 주제(표시 없음)는 null', () => {
    expect(missingMark({ holdReason: null, missingSince: null })).toBeNull();
  });

  it('실행 이력 없이 자동 보류된 것은 auto-held', () => {
    expect(missingMark({ holdReason: HOLD_REASON_REMOVED, missingSince: null })).toBe('auto-held');
  });

  it('확인 대기(missingSince)는 pending — "그대로 두기"를 골라도 줄은 없으므로 그대로', () => {
    expect(missingMark({ holdReason: null, missingSince: new Date('2026-10-01') })).toBe('pending');
  });

  it('모르는 holdReason은 사라짐이 아니다', () => {
    expect(missingMark({ holdReason: 'manual', missingSince: null })).toBeNull();
  });
});
