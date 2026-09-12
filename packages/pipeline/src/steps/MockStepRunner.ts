// 토큰 없이 워커를 돌리기 위한 StepRunner. 실행은 월 1~2회 상위 모델이라 비싸서, 워커의 어려운
// 부분(클레임·순서·heartbeat·재시도·비용 기록)은 이걸로 CI에서 반복 검증한다.
// 단계마다 **결정적인** 산출물을 돌려준다 — 같은 입력이면 같은 결과여야 diff가 의미 있다.
// (decisions/run-execution-model.md)
import { STEP_ORDER, type StepName } from '../run/stateMachine.ts';
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';

/** 단계별 산출물 파일 이름. 실제 파일 쓰기는 B3a가 한다 — 여기서는 내용만 만든다. */
const ARTIFACT_NAME: Record<StepName, string> = {
  evidence: 'evidence.json',
  velog: 'velog.md',
  verify: 'verification.json',
  linkedin: 'linkedin.md',
  zenn: 'zenn.md',
  publishInfo: 'publish.md',
};

export interface MockStepRunnerOptions {
  /** 이 단계에서 실패하게 만든다(워커의 재시도·실패 경로 테스트용). */
  failAt?: { step: StepName; code: string; message?: string; retryable?: boolean };
  /** `failAt`이 이 횟수만큼만 실패하고 그 뒤엔 성공한다(재시도 성공 경로). */
  failTimes?: number;
  /** 근거 검증 줄에 띄울 표시용 플래그. 전이에는 영향이 없다. */
  verifyFlags?: { unsupported: number; uncertain: number };
}

/**
 * 결정적 Mock. 단계마다 고정 텍스트를 만들고 토큰·비용은 글자 수에서 어림한다
 * (모델이 없는 단계는 비운다 — 워커가 추정하지 않는다는 규칙을 Mock도 지킨다).
 */
export function createMockStepRunner(options: MockStepRunnerOptions = {}): StepRunner {
  let failures = 0;

  return {
    async run(ctx: StepContext): Promise<StepResult> {
      ctx.signal.throwIfAborted();

      const fail = options.failAt;
      if (fail !== undefined && fail.step === ctx.step) {
        const limit = options.failTimes ?? Number.POSITIVE_INFINITY;
        if (failures < limit) {
          failures += 1;
          throw new StepFailure(
            fail.code,
            fail.message ?? `${ctx.step} 단계 실패`,
            fail.retryable ?? false,
          );
        }
      }

      const body = [
        `# ${ctx.topic.title}`,
        `단계: ${ctx.step}`,
        ctx.instruction !== undefined ? `수정 지시: ${ctx.instruction}` : null,
      ]
        .filter((line) => line !== null)
        .join('\n');

      const result: StepResult = { artifacts: { [ARTIFACT_NAME[ctx.step]]: body } };

      // 썸네일이 없는 대신 publishInfo를 모델 없는 단계로 둔다 — 모델 없는 경로도 워커가 겪게.
      if (ctx.step !== 'publishInfo') {
        result.tokens = { input: body.length, output: body.length * 2 };
        result.costUsd = 0;
        result.model = 'mock';
      }
      if (ctx.step === 'verify' && options.verifyFlags !== undefined) {
        result.flags = options.verifyFlags;
      }
      return result;
    },
  };
}

/** 순서 배열을 Mock이 함께 내보내 테스트가 STEP_ORDER를 다시 적지 않게. */
export const MOCK_STEPS = STEP_ORDER;
