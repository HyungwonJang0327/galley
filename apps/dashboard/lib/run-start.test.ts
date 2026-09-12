import { describe, it, expect, vi, afterEach } from 'vitest';

const { startRun, createModelRegistryFromEnv } = vi.hoisted(() => ({
  startRun: vi.fn(),
  createModelRegistryFromEnv: vi.fn(() => ({ registry: true })),
}));

// 실제 SQLite·모델 SDK 대신 pipeline 경계만 가짜로 둔다(생성 자체는 pipeline 테스트가 본다).
vi.mock('@galley/pipeline', () => ({ prisma: {}, startRun, createModelRegistryFromEnv }));

import { startRunForTopic } from './run-start';

const RUN = {
  id: 'run_1',
  topicId: 'topic_1',
  attempt: 1,
  topicSlug: '무한-스크롤',
  topicTitle: '무한 스크롤',
  status: '실행 중',
  modelId: 'anthropic:claude-opus-5',
  startedAt: new Date('2026-09-12T01:02:03.000Z'),
  finishedAt: null,
};

afterEach(() => {
  startRun.mockReset();
});

describe('startRunForTopic', () => {
  it('pipeline에 제목·모델을 넘기고 날짜를 문자열로 돌려준다', async () => {
    startRun.mockResolvedValue({ ok: true, run: RUN });

    const result = await startRunForTopic({ topicId: 'topic_1', modelId: 'mock' });

    expect(result).toEqual({
      ok: true,
      data: {
        id: 'run_1',
        topicId: 'topic_1',
        attempt: 1,
        topicSlug: '무한-스크롤',
        topicTitle: '무한 스크롤',
        status: '실행 중',
        modelId: 'anthropic:claude-opus-5',
        startedAt: '2026-09-12T01:02:03.000Z',
      },
    });
    expect(startRun.mock.calls[0]?.[1]).toEqual({ topicId: 'topic_1', modelId: 'mock' });
  });

  it('pipeline 실패 코드는 읽을 수 있는 문구로 바꾼다', async () => {
    startRun.mockResolvedValue({ ok: false, code: 'RUN_ALREADY_ACTIVE' });

    expect(await startRunForTopic({ topicId: 'topic_1' })).toEqual({
      ok: false,
      error: { code: 'RUN_ALREADY_ACTIVE', message: expect.stringContaining('끝나지 않은') },
    });
  });

  it('던지면 RUN_START_FAILED로 감싼다', async () => {
    startRun.mockRejectedValue(new Error('SQLITE_BUSY'));

    expect(await startRunForTopic({ topicId: 'topic_1' })).toMatchObject({
      ok: false,
      error: { code: 'RUN_START_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });
});
