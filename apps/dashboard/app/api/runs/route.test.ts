import { describe, it, expect, vi, afterEach } from 'vitest';

const { startRunForTopic } = vi.hoisted(() => ({ startRunForTopic: vi.fn() }));

// DB·모델 레지스트리는 어댑터(lib/run-start) 테스트가 본다. 여기서는 HTTP 경계만.
vi.mock('../../../lib/run-start', () => ({ startRunForTopic }));

import { POST } from './route';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/runs', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const RUN = {
  id: 'run_1',
  topicSlug: '무한-스크롤',
  topicTitle: '무한 스크롤',
  status: '실행 중',
  modelId: 'anthropic:claude-opus-5',
  startedAt: '2026-09-12T01:02:03.000Z',
};

afterEach(() => {
  startRunForTopic.mockReset();
});

describe('POST /api/runs', () => {
  it('만들어지면 201과 실행을 돌려준다', async () => {
    startRunForTopic.mockResolvedValue({ ok: true, data: RUN });

    const response = await post({ title: '무한 스크롤', modelId: 'mock' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: RUN });
    expect(startRunForTopic).toHaveBeenCalledWith({ title: '무한 스크롤', modelId: 'mock' });
  });

  it('modelId가 없으면 넘기지 않는다(기본 모델은 pipeline이 고른다)', async () => {
    startRunForTopic.mockResolvedValue({ ok: true, data: RUN });

    await post({ title: '무한 스크롤' });

    expect(startRunForTopic).toHaveBeenCalledWith({ title: '무한 스크롤' });
  });

  it('JSON이 아니면 400 INVALID_BODY', async () => {
    const response = await post('not json');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
    expect(startRunForTopic).not.toHaveBeenCalled();
  });

  it('title이 문자열이 아니면 실행하지 않는다', async () => {
    const response = await post({ title: 42 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
    expect(startRunForTopic).not.toHaveBeenCalled();
  });

  it('modelId가 문자열이 아니면 실행하지 않는다', async () => {
    const response = await post({ title: '무한 스크롤', modelId: 7 });

    expect(response.status).toBe(400);
    expect(startRunForTopic).not.toHaveBeenCalled();
  });

  it('이미 도는 주제면 409', async () => {
    startRunForTopic.mockResolvedValue({
      ok: false,
      error: { code: 'RUN_ALREADY_ACTIVE', message: '이미 있습니다.' },
    });

    const response = await post({ title: '무한 스크롤' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'RUN_ALREADY_ACTIVE', message: '이미 있습니다.' },
    });
  });

  it('시작하지 못하면 500', async () => {
    startRunForTopic.mockResolvedValue({
      ok: false,
      error: { code: 'RUN_START_FAILED', message: '실패' },
    });

    expect((await post({ title: '무한 스크롤' })).status).toBe(500);
  });
});
