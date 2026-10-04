import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const { startRun, createModelRegistryFromEnv, getQueueSections } = vi.hoisted(() => ({
  startRun: vi.fn(),
  createModelRegistryFromEnv: vi.fn(() => ({ registry: true })),
  getQueueSections: vi.fn(),
}));

// 실제 SQLite·모델 SDK 대신 pipeline 경계만 가짜로 둔다(생성 자체는 pipeline 테스트가 본다).
vi.mock('@galley/pipeline', () => ({ prisma: {}, startRun, createModelRegistryFromEnv }));

// 재적재 자체(파일 → DB)는 queue-data·pipeline 테스트가 본다. 여기서는 순서와 실패 처리만.
vi.mock('./queue-data', () => ({ getQueueSections }));

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

beforeEach(() => {
  getQueueSections.mockResolvedValue({
    ok: true,
    data: { 대기: [], 후보: [], 보류: [], 완료: [] },
  });
});

afterEach(() => {
  startRun.mockReset();
  getQueueSections.mockReset();
});

describe('startRunForTopic', () => {
  it('시작 직전에 큐 파일을 다시 적재한다(가드가 최신 상태를 보게)', async () => {
    startRun.mockResolvedValue({ ok: true, run: RUN });

    await startRunForTopic({ topicId: 'topic_1' });

    expect(getQueueSections).toHaveBeenCalledTimes(1);
    expect(getQueueSections.mock.invocationCallOrder[0]).toBeLessThan(
      startRun.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('다시 읽지 못하면 시작하지 않는다(확인 못 한 상태로 비용을 쓰지 않는다)', async () => {
    getQueueSections.mockResolvedValue({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '루트 .env에 BLOG_DIR이 없습니다.' },
    });

    expect(await startRunForTopic({ topicId: 'topic_1' })).toEqual({
      ok: false,
      error: {
        code: 'QUEUE_RELOAD_FAILED',
        message: '실행 전에 큐 파일을 다시 읽지 못했습니다. 루트 .env에 BLOG_DIR이 없습니다.',
      },
    });
    expect(startRun).not.toHaveBeenCalled();
  });

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

  it('완료된 주제는 되돌리는 방법을 문구로 안내한다', async () => {
    startRun.mockResolvedValue({ ok: false, code: 'TOPIC_ALREADY_DONE' });

    expect(await startRunForTopic({ topicId: 'topic_1' })).toEqual({
      ok: false,
      error: {
        code: 'TOPIC_ALREADY_DONE',
        message: expect.stringContaining('날짜만 뗀 뒤'),
      },
    });
    const result = await startRunForTopic({ topicId: 'topic_1' });
    if (result.ok) throw new Error('거절돼야 한다');
    // 버튼 이름과 같은 말, 가장 실수하기 쉬운 주의.
    expect(result.error.message).toContain('파일에서 다시 불러오세요');
    expect(result.error.message).toContain('제목은 고치지 않습니다');
  });

  it('슬러그 충돌은 원인(되돌리며 제목 수정·날짜)을 짚어 준다', async () => {
    startRun.mockResolvedValue({ ok: false, code: 'SLUG_TAKEN' });

    expect(await startRunForTopic({ topicId: 'topic_1' })).toEqual({
      ok: false,
      error: { code: 'SLUG_TAKEN', message: expect.stringContaining('제목을 고쳤거나') },
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
