// 상태 머신 전이 테스트(B1b). 요구사항 출처는 decisions/evidence-collection.md 6개.
// 순수 함수라 DB·픽스처가 없다 — 입력 배열과 출력만 본다.
import { describe, it, expect } from 'vitest';
import {
  RUN_STATUS,
  STEP_ORDER,
  STEP_STATUS,
  applyCommand,
  isStepName,
  nextAction,
  planRerun,
  type StepName,
  type StepState,
} from './stateMachine';

/** 단계 목록을 "여기까지 완료"로 만든다. 나머지는 대기. */
const doneUpTo = (count: number): StepState[] =>
  STEP_ORDER.map((name, index) => ({
    name,
    status: index < count ? STEP_STATUS.done : STEP_STATUS.pending,
  }));

describe('STEP_ORDER', () => {
  it('단계 6개 순서가 고정돼 있다', () => {
    expect(STEP_ORDER).toEqual(['evidence', 'velog', 'verify', 'linkedin', 'zenn', 'publishInfo']);
  });

  it('밖에서 들어온 문자열을 단계 이름으로 좁힌다', () => {
    expect(isStepName('velog')).toBe(true);
    expect(isStepName('벨로그 본문')).toBe(false);
    expect(isStepName('')).toBe(false);
  });
});

describe('nextAction — 다음에 돌 단계', () => {
  it('아무것도 안 돌았으면 첫 단계', () => {
    expect(nextAction(doneUpTo(0))).toEqual({ kind: 'runStep', step: 'evidence' });
  });

  it('두 단계가 끝났으면 세 번째', () => {
    expect(nextAction(doneUpTo(2))).toEqual({ kind: 'runStep', step: 'verify' });
  });

  it('6단계가 다 끝나면 승인 대기로', () => {
    expect(nextAction(doneUpTo(6))).toEqual({ kind: 'awaitApproval' });
  });

  it('목록에 없는 단계는 대기로 친다', () => {
    expect(nextAction([{ name: 'evidence', status: STEP_STATUS.done }])).toEqual({
      kind: 'runStep',
      step: 'velog',
    });
  });

  it('입력 순서가 뒤섞여도 STEP_ORDER를 기준으로 고른다', () => {
    const shuffled = [...doneUpTo(2)].reverse();

    expect(nextAction(shuffled)).toEqual({ kind: 'runStep', step: 'verify' });
  });

  it('실행 중이던 단계는 처음부터 다시 돌린다(단계는 원자적)', () => {
    const steps = doneUpTo(1);
    steps[1] = { name: 'velog', status: STEP_STATUS.running };

    expect(nextAction(steps)).toEqual({ kind: 'runStep', step: 'velog' });
  });

  it('실패한 단계가 있으면 뒤에 대기가 있어도 실패', () => {
    const steps = doneUpTo(1);
    steps[1] = { name: 'velog', status: STEP_STATUS.failed };

    expect(nextAction(steps)).toEqual({ kind: 'fail', step: 'velog' });
  });

  it('건너뛴 단계는 끝난 것으로 보고 넘어간다', () => {
    const steps = doneUpTo(6);
    steps[0] = { name: 'evidence', status: STEP_STATUS.skipped };

    expect(nextAction(steps)).toEqual({ kind: 'awaitApproval' });
  });

  it('근거 검증에 unsupported가 있어도 전이에 영향이 없다(표시용 플래그)', () => {
    const steps = doneUpTo(6);
    steps[2] = {
      name: 'verify',
      status: STEP_STATUS.done,
      flags: { unsupported: 3, uncertain: 1 },
    };

    expect(nextAction(steps)).toEqual({ kind: 'awaitApproval' });
  });
});

describe('planRerun — 수정 지시가 다시 돌릴 단계', () => {
  it('본문을 고치면 근거 검증도 자동으로 다시 돈다', () => {
    expect(planRerun('velog', '문장을 더 짧게')).toEqual({
      steps: ['velog', 'verify'],
      skipped: ['evidence'],
    });
  });

  it('나머지 단계는 그 단계만 다시 돈다', () => {
    expect(planRerun('linkedin', '더 캐주얼하게')).toEqual({
      steps: ['linkedin'],
      skipped: ['evidence'],
    });
  });

  it.each(['근거', '커밋', '코드'])('지시에 "%s"가 있으면 근거 수집까지 포함한다', (keyword) => {
    expect(planRerun('velog', `${keyword}가 부실해`)).toEqual({
      steps: ['evidence', 'velog', 'verify'],
      skipped: [],
    });
  });

  it('근거 수집을 대상으로 지정하면 지시와 무관하게 포함한다', () => {
    expect(planRerun('evidence', '다시')).toEqual({ steps: ['evidence'], skipped: [] });
  });

  it('돌릴 단계는 언제나 STEP_ORDER 순서다', () => {
    const { steps } = planRerun('velog', '근거 보강');
    const positions = steps.map((step: StepName) => STEP_ORDER.indexOf(step));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe('applyCommand — 승인 게이트', () => {
  it('승인 대기에서 승인하면 완료', () => {
    expect(applyCommand(RUN_STATUS.pendingApproval, { type: 'approve' })).toEqual({
      ok: true,
      status: RUN_STATUS.done,
    });
  });

  it('승인 대기에서 수정 지시하면 다시 실행 중 + 재실행 계획', () => {
    expect(
      applyCommand(RUN_STATUS.pendingApproval, {
        type: 'revise',
        target: 'velog',
        instruction: '문장을 더 짧게',
      }),
    ).toEqual({
      ok: true,
      status: RUN_STATUS.running,
      rerun: { steps: ['velog', 'verify'], skipped: ['evidence'] },
    });
  });

  it.each([RUN_STATUS.running, RUN_STATUS.done, RUN_STATUS.failed])(
    '%s 실행에는 승인이 통하지 않는다',
    (status) => {
      expect(applyCommand(status, { type: 'approve' })).toEqual({
        ok: false,
        code: 'NOT_PENDING_APPROVAL',
      });
    },
  );

  it('완료된 실행에는 수정 지시도 통하지 않는다', () => {
    expect(
      applyCommand(RUN_STATUS.done, { type: 'revise', target: 'velog', instruction: '고쳐줘' }),
    ).toEqual({ ok: false, code: 'NOT_PENDING_APPROVAL' });
  });
});
