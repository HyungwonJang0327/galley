import { describe, it, expect } from 'vitest';
import { STEP_ORDER } from '@galley/pipeline';
import {
  isPendingApproval,
  isRunInProgress,
  runStatusBadge,
  STEP_OPTIONS,
  stepLabel,
  stepTimeline,
} from './run-labels';

describe('runStatusBadge', () => {
  it.each([
    ['running', '실행 중', 'info', true],
    ['pendingApproval', '승인 대기', 'warning', false],
    ['done', '완료', 'success', false],
    ['failed', '실패', 'danger', false],
    ['revised', '수정 지시', 'neutral', false],
  ] as const)('%s → %s(%s, pulse=%s)', (status, label, tone, pulse) => {
    expect(runStatusBadge(status)).toEqual({ label, tone, pulse });
  });

  it('모르는 값은 그대로 회색으로(화면이 죽지 않는다)', () => {
    expect(runStatusBadge('weird')).toEqual({ label: 'weird', tone: 'neutral', pulse: false });
  });
});

describe('isPendingApproval', () => {
  it('승인 대기만 true — 실패·완료·실행 중은 손댈 수 없다', () => {
    expect(isPendingApproval('pendingApproval')).toBe(true);
    expect(isPendingApproval('running')).toBe(false);
    expect(isPendingApproval('failed')).toBe(false);
    expect(isPendingApproval('done')).toBe(false);
    expect(isPendingApproval('weird')).toBe(false);
  });
});

describe('isRunInProgress', () => {
  it('실행 중만 true — 승인 대기는 워커가 손을 뗀 상태라 폴링하지 않는다', () => {
    expect(isRunInProgress('running')).toBe(true);
    expect(isRunInProgress('pendingApproval')).toBe(false);
    expect(isRunInProgress('done')).toBe(false);
  });
});

describe('stepLabel / STEP_OPTIONS', () => {
  it('6단계 라벨이 파이프라인 순서를 따른다', () => {
    expect(STEP_OPTIONS.map((o) => o.name)).toEqual([...STEP_ORDER]);
    expect(STEP_OPTIONS.map((o) => o.label)).toEqual([
      '근거 수집',
      '벨로그 본문',
      '근거 검증',
      '링크드인',
      'Zenn',
      '발행정보·썸네일',
    ]);
  });

  it('모르는 단계 이름은 그대로', () => {
    expect(stepLabel('mystery')).toBe('mystery');
  });
});

describe('stepTimeline', () => {
  it.each([
    ['pending', 'pending', '대기'],
    ['running', 'active', '진행 중'],
    ['succeeded', 'done', '완료'],
    ['failed', 'failed', '실패'],
  ] as const)('fresh %s → %s(%s)', (status, timeline, label) => {
    expect(stepTimeline({ status, origin: 'fresh' })).toEqual({
      status: timeline,
      statusLabel: label,
      carried: false,
    });
  });

  it('carried 성공은 "이전 결과" — "건너뜀"이라 부르지 않는다', () => {
    expect(stepTimeline({ status: 'succeeded', origin: 'carried' })).toEqual({
      status: 'done',
      statusLabel: '이전 결과',
      carried: true,
    });
  });

  it('모르는 상태는 pending 마커에 값 그대로', () => {
    expect(stepTimeline({ status: 'odd', origin: 'fresh' })).toEqual({
      status: 'pending',
      statusLabel: 'odd',
      carried: false,
    });
  });
});
