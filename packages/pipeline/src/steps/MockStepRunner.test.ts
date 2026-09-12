import { describe, it, expect } from 'vitest';
import { createMockStepRunner } from './MockStepRunner';
import { StepFailure, toStepFailure } from './StepRunner';
import { STEP_ORDER } from '../run/stateMachine';

const ctx = (step: (typeof STEP_ORDER)[number], extra: Partial<{ instruction: string }> = {}) => ({
  runId: 'run_1',
  step,
  topic: { id: 't1', title: '무한 스크롤', slug: '무한-스크롤' },
  signal: new AbortController().signal,
  ...extra,
});

describe('createMockStepRunner', () => {
  it('단계마다 산출물을 하나씩 만든다', async () => {
    const runner = createMockStepRunner();

    for (const step of STEP_ORDER) {
      const result = await runner.run(ctx(step));
      expect(Object.keys(result.artifacts)).toHaveLength(1);
    }
  });

  it('같은 입력이면 같은 산출물(결정적)', async () => {
    const runner = createMockStepRunner();

    const a = await runner.run(ctx('velog'));
    const b = await runner.run(ctx('velog'));

    expect(a.artifacts).toEqual(b.artifacts);
  });

  it('수정 지시가 산출물에 반영된다(재실행 diff가 보이게)', async () => {
    const runner = createMockStepRunner();

    const first = await runner.run(ctx('velog'));
    const revised = await runner.run(ctx('velog', { instruction: '더 짧게' }));

    expect(revised.artifacts).not.toEqual(first.artifacts);
    expect(Object.values(revised.artifacts)[0]).toContain('더 짧게');
  });

  it('모델 없는 단계는 토큰·비용·모델을 비운다(워커가 추정하지 않는다)', async () => {
    const runner = createMockStepRunner();

    const withModel = await runner.run(ctx('velog'));
    const withoutModel = await runner.run(ctx('publishInfo'));

    expect(withModel.model).toBe('mock');
    expect(withoutModel.model).toBeUndefined();
    expect(withoutModel.tokens).toBeUndefined();
    expect(withoutModel.costUsd).toBeUndefined();
  });

  it('검증 플래그는 결과에 실려 오지만 실패가 아니다', async () => {
    const runner = createMockStepRunner({ verifyFlags: { unsupported: 2, uncertain: 1 } });

    const result = await runner.run(ctx('verify'));

    expect(result.flags).toEqual({ unsupported: 2, uncertain: 1 });
  });

  it('지정한 단계에서 실패하고 재시도 가능 여부를 알린다', async () => {
    const runner = createMockStepRunner({
      failAt: { step: 'zenn', code: 'RATE_LIMITED', retryable: true },
    });

    await expect(runner.run(ctx('velog'))).resolves.toBeTruthy();
    await expect(runner.run(ctx('zenn'))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryable: true,
    });
  });

  it('failTimes만큼만 실패하고 그 뒤엔 성공한다(재시도 성공 경로)', async () => {
    const runner = createMockStepRunner({
      failAt: { step: 'velog', code: 'TIMEOUT', retryable: true },
      failTimes: 2,
    });

    await expect(runner.run(ctx('velog'))).rejects.toBeInstanceOf(StepFailure);
    await expect(runner.run(ctx('velog'))).rejects.toBeInstanceOf(StepFailure);
    await expect(runner.run(ctx('velog'))).resolves.toBeTruthy();
  });

  it('이미 끊긴 signal이면 아무것도 하지 않는다', async () => {
    const runner = createMockStepRunner();
    const controller = new AbortController();
    controller.abort();

    await expect(runner.run({ ...ctx('velog'), signal: controller.signal })).rejects.toBeTruthy();
  });
});

describe('toStepFailure', () => {
  it('StepFailure는 그대로 둔다', () => {
    const failure = new StepFailure('RATE_LIMITED', '잠시 뒤 다시', true);

    expect(toStepFailure(failure)).toBe(failure);
  });

  it('중단은 재시도 가능으로 본다', () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });

    expect(toStepFailure(aborted)).toMatchObject({ code: 'ABORTED', retryable: true });
  });

  it('그 밖의 예외는 영구 실패로 좁힌다', () => {
    expect(toStepFailure(new Error('boom'))).toMatchObject({
      code: 'STEP_FAILED',
      message: 'boom',
      retryable: false,
    });
  });
});
