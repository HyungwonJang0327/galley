// 상태 머신 전이 테스트(B1b). 요구사항 출처는 decisions/evidence-collection.md 6개.
// 순수 함수라 DB·픽스처가 없다 — 입력 배열과 출력만 본다.
import { describe, it, expect } from 'vitest';
import {
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  STEP_STATUS,
  applyCommand,
  isStepName,
  nextAction,
  planRerun,
  type StepState,
} from './stateMachine.ts';

/** 단계 목록을 "여기까지 완료"로 만든다. 나머지는 대기. */
const doneUpTo = (count: number): StepState[] =>
  STEP_ORDER.map((name, index) => ({
    name,
    status: index < count ? STEP_STATUS.succeeded : STEP_STATUS.pending,
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
    expect(nextAction([{ name: 'evidence', status: STEP_STATUS.succeeded }])).toEqual({
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

  it('이전 결과를 가져온(carried) 단계도 끝난 것으로 본다', () => {
    const steps = doneUpTo(6);
    steps[0] = {
      name: 'evidence',
      status: STEP_STATUS.succeeded,
      origin: STEP_ORIGIN.carried,
    };

    expect(nextAction(steps)).toEqual({ kind: 'awaitApproval' });
  });

  it('출처(origin)는 생명주기(status)와 직교한다 — 재실행 중 시작 단계가 실패한 모습', () => {
    // 본문부터 재실행하다 본문이 실패: 앞은 이전 결과, 시작 단계는 이번에 돌다 실패, 뒤는 아직.
    const steps: StepState[] = [
      { name: 'evidence', status: STEP_STATUS.succeeded, origin: STEP_ORIGIN.carried },
      { name: 'velog', status: STEP_STATUS.failed, origin: STEP_ORIGIN.fresh },
      { name: 'verify', status: STEP_STATUS.pending },
      { name: 'linkedin', status: STEP_STATUS.pending },
      { name: 'zenn', status: STEP_STATUS.pending },
      { name: 'publishInfo', status: STEP_STATUS.pending },
    ];

    expect(nextAction(steps)).toEqual({ kind: 'fail', step: 'velog' });
  });

  it('근거 검증에 unsupported가 있어도 전이에 영향이 없다(표시용 플래그)', () => {
    const steps = doneUpTo(6);
    steps[2] = {
      name: 'verify',
      status: STEP_STATUS.succeeded,
      flags: { unsupported: 3, uncertain: 1 },
    };

    expect(nextAction(steps)).toEqual({ kind: 'awaitApproval' });
  });
});

describe('planRerun — 재실행 범위', () => {
  it.each(STEP_ORDER)('%s부터 시작하면 fresh + carried가 6단계와 정확히 맞는다', (startStep) => {
    const plan = planRerun({ startStep, instruction: '아무 지시' });

    // 속성: 두 목록을 이으면 STEP_ORDER 그대로다 — 빠짐·중복·순서 어긋남이 한 번에 걸린다.
    expect([...plan.carried, ...plan.fresh]).toEqual([...STEP_ORDER]);
    expect(plan.startStep).toBe(startStep);
    expect(plan.fresh[0]).toBe(startStep);
    expect(plan.carried).not.toContain(startStep);
  });

  it('근거 수집이 시작이면 carried가 비고 6단계 전부 다시 돈다', () => {
    const plan = planRerun({ startStep: 'evidence', instruction: '다시' });

    expect(plan.carried).toEqual([]);
    expect(plan.fresh).toEqual([...STEP_ORDER]);
  });

  it('마지막 단계만 돌면 fresh가 하나, 앞 다섯은 carried', () => {
    const plan = planRerun({ startStep: 'publishInfo', instruction: '제목만 바꿔' });

    expect(plan.fresh).toEqual(['publishInfo']);
    expect(plan.carried).toEqual(['evidence', 'velog', 'verify', 'linkedin', 'zenn']);
  });

  describe('시작 단계 결정', () => {
    it('단계 지정이 있으면 그 단계가 시작', () => {
      expect(planRerun({ startStep: 'linkedin', instruction: '더 캐주얼하게' }).startStep).toBe(
        'linkedin',
      );
    });

    it('단계 지정은 지시 텍스트보다 우선한다', () => {
      // 지시에 "근거"가 있어도 지정이 이긴다.
      expect(planRerun({ startStep: 'zenn', instruction: '근거를 다시 봐' }).startStep).toBe(
        'zenn',
      );
    });

    it.each(['근거', '커밋', '코드'])(
      '지정이 없고 지시에 "%s"가 있으면 근거 수집부터',
      (keyword) => {
        expect(planRerun({ instruction: `${keyword}가 부실해` }).startStep).toBe('evidence');
      },
    );

    it('지정도 없고 키워드도 없으면 본문부터', () => {
      expect(planRerun({ instruction: '문장을 더 짧게' }).startStep).toBe('velog');
    });
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
        startStep: 'velog',
        instruction: '문장을 더 짧게',
      }),
    ).toEqual({
      ok: true,
      status: RUN_STATUS.running,
      rerun: {
        startStep: 'velog',
        fresh: ['velog', 'verify', 'linkedin', 'zenn', 'publishInfo'],
        carried: ['evidence'],
      },
    });
  });

  it('단계 지정 없이 수정 지시하면 지시 텍스트로 시작 단계를 정한다', () => {
    const result = applyCommand(RUN_STATUS.pendingApproval, {
      type: 'revise',
      instruction: '커밋을 다시 확인해',
    });

    expect(result).toMatchObject({ ok: true, rerun: { startStep: 'evidence', carried: [] } });
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
      applyCommand(RUN_STATUS.done, { type: 'revise', startStep: 'velog', instruction: '고쳐줘' }),
    ).toEqual({ ok: false, code: 'NOT_PENDING_APPROVAL' });
  });
});
