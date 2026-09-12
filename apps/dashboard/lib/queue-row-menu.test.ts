import { describe, it, expect } from 'vitest';
import { queueRowMenuEntries, parseMoveTarget, RUN_NOW_ID } from './queue-row-menu';

const labels = (status: '대기' | '후보' | '보류') =>
  queueRowMenuEntries(status).map((entry) => ('type' in entry ? '—' : entry.label));

describe('queueRowMenuEntries', () => {
  it('현재 섹션으로 가는 항목은 빼고 나머지 이동 2개를 준다', () => {
    expect(labels('대기')).toEqual(['후보로', '보류로', '—', '지금 실행']);
    expect(labels('후보')).toEqual(['대기로', '보류로', '—', '지금 실행']);
    expect(labels('보류')).toEqual(['대기로', '후보로', '—', '지금 실행']);
  });

  it('"지금 실행"은 사유와 함께 비활성(실행 화면 전)', () => {
    const runNow = queueRowMenuEntries('대기').find(
      (entry) => !('type' in entry) && entry.id === RUN_NOW_ID,
    );

    expect(runNow).toMatchObject({
      disabled: true,
      disabledReason: expect.stringContaining('준비 중'),
    });
  });
});

describe('parseMoveTarget', () => {
  it('이동 항목 id에서 섹션을 뽑는다', () => {
    expect(parseMoveTarget('move:대기')).toBe('대기');
    expect(parseMoveTarget('move:보류')).toBe('보류');
  });

  it('이동 항목이 아니거나 모르는 섹션이면 null', () => {
    expect(parseMoveTarget(RUN_NOW_ID)).toBeNull();
    expect(parseMoveTarget('move:완료')).toBeNull();
    expect(parseMoveTarget('move:없는섹션')).toBeNull();
  });
});
