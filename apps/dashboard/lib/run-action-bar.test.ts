import { describe, it, expect } from 'vitest';
import { describeRerunPlan, validateInstruction } from './run-action-bar';

const STEPS = [
  { name: 'evidence', label: '근거 수집' },
  { name: 'velog', label: '벨로그 본문' },
  { name: 'verify', label: '근거 검증' },
];

describe('validateInstruction', () => {
  it('공백만이면 입력 요구', () => {
    expect(validateInstruction('   ', 2000)).toBe('수정 지시를 입력해 주세요.');
  });

  it('상한을 넘으면 길이 안내', () => {
    expect(validateInstruction('가'.repeat(11), 10)).toBe('수정 지시는 10자 이하로 써 주세요.');
  });

  it('정상이면 null — 앞뒤 공백은 세지 않는다', () => {
    expect(validateInstruction('  부드럽게  ', 4)).toBeNull();
  });
});

describe('describeRerunPlan', () => {
  it('다시 도는 단계를 라벨 화살표로, 이전 결과 단계는 가운뎃점으로 잇는다', () => {
    expect(
      describeRerunPlan(
        { startStep: 'velog', fresh: ['velog', 'verify'], carried: ['evidence'], sources: {} },
        STEPS,
      ),
    ).toEqual({ fresh: '벨로그 본문 → 근거 검증', carried: '근거 수집' });
  });

  it('첫 단계부터면 carried는 null', () => {
    expect(
      describeRerunPlan(
        { startStep: 'evidence', fresh: ['evidence', 'velog'], carried: [], sources: {} },
        STEPS,
      ).carried,
    ).toBeNull();
  });

  it('모르는 단계 이름은 그대로 쓴다(화면이 죽지 않는다)', () => {
    expect(
      describeRerunPlan(
        { startStep: 'evidence', fresh: ['evidence', 'weird' as never], carried: [], sources: {} },
        STEPS,
      ).fresh,
    ).toBe('근거 수집 → weird');
  });
});
