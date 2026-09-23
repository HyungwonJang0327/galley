// 글쓰기 단계 공용 헬퍼 — 순수 함수라 파일·모델·DB 없이 검사한다. 러너와 엮인 동작(펜스 충돌·호출 중 abort)은 각 단계 테스트에.
import { describe, test, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  abortable,
  classifyModelError,
  fenceFor,
  tonePromptFailure,
  unwrapFence,
} from './writing.ts';

describe('writing helpers', () => {
  test('fenceFor는 조각 안 최장 백틱보다 긴 펜스(최소 3), unwrapFence는 전체 펜스만 벗긴다', () => {
    expect(fenceFor('plain')).toBe('```');
    expect(fenceFor('a\n```md\nb\n```')).toBe('````');
    expect(fenceFor('x `````` y')).toBe('```````');
    expect(unwrapFence('```markdown\n# 본문\n\n내용\n```')).toBe('# 본문\n\n내용');
    expect(unwrapFence('```\n# 본문\n```\n')).toBe('# 본문');
    expect(unwrapFence('# 본문\n```ts\ncode\n```')).toBe('# 본문\n```ts\ncode\n```'); // 부분 펜스는 그대로
  });

  test('abortable — 끝난 신호면 즉시 거부, 아니면 결과 그대로, 도중 abort면 AbortError', async () => {
    await expect(abortable(Promise.resolve(1), new AbortController().signal)).resolves.toBe(1);
    const done = new AbortController();
    done.abort();
    await expect(abortable(new Promise(() => {}), done.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    const c = new AbortController();
    const p = abortable(new Promise(() => {}), c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('모델 호출 실패의 재시도 분류: 429·5xx·네트워크는 재시도, 401·거부는 영구, 원본은 cause', () => {
    // 실제 SDK 오류 클래스
    const rate = new Anthropic.APIError(
      429,
      { error: { type: 'rate_limit_error' } },
      'rate limited',
      undefined,
    );
    expect(classifyModelError(rate, 'X')).toMatchObject({ code: 'X', retryable: true });
    expect(
      classifyModelError(new Anthropic.APIConnectionError({ message: 'Connection error.' }), 'X')
        .retryable,
    ).toBe(true);
    expect(
      classifyModelError(new Anthropic.APIError(401, undefined, 'unauthorized', undefined), 'X')
        .retryable,
    ).toBe(false);
    expect(
      classifyModelError(
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' }),
        'X',
      ),
    ).toMatchObject({ retryable: true });
    expect(
      classifyModelError(Object.assign(new Error('boom'), { status: 503 }), 'X').retryable,
    ).toBe(true);
    expect(
      classifyModelError(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' }), 'X')
        .retryable,
    ).toBe(true);
    const refusal = classifyModelError(
      new Error('모델이 응답을 거부했습니다 (stop_reason refusal)'),
      'X',
    );
    expect(refusal.retryable).toBe(false);
    expect(refusal.message).toContain('거부');
    expect(refusal.cause).toBeInstanceOf(Error);
    expect(classifyModelError(new Error('API 키 없음'), 'X').message).not.toContain('키 없음'); // 원문 대신 고정 문구
    expect(
      tonePromptFailure({ ok: false, code: 'PROMPT_UNREADABLE', step: 'linkedin' }),
    ).toMatchObject({
      code: 'PROMPT_UNREADABLE',
      retryable: false,
      message: expect.stringContaining('linkedin.md'),
    });
    expect(
      tonePromptFailure({ ok: false, code: 'PROMPT_NOT_FOUND', step: 'velog' }).message,
    ).toContain('velog.md');
    expect(tonePromptFailure({ ok: false, code: 'PROMPT_EMPTY', step: 'zenn' })).toMatchObject({
      code: 'PROMPT_EMPTY',
      retryable: false,
      message: expect.stringContaining('zenn.md'),
    });
  });
});
