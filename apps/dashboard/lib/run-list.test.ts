import { describe, it, expect, vi, afterEach } from 'vitest';

const { listRuns } = vi.hoisted(() => ({ listRuns: vi.fn() }));

// 조회 자체는 pipeline DB 테스트가 본다. 여기서는 필터 전달, 날짜 직렬화, 실패 봉투만.
vi.mock('@galley/pipeline', () => ({ prisma: {}, listRuns }));

import { getRunList } from './run-list';

afterEach(() => listRuns.mockReset());

const ITEM = {
  id: 'run_1',
  topicId: 'topic_1',
  attempt: 1,
  topicSlug: '무한-스크롤',
  topicTitle: '무한 스크롤',
  status: 'running',
  modelId: 'mock',
  startedAt: new Date('2026-09-13T03:00:00.000Z'),
  finishedAt: null,
  steps: [{ name: 'evidence', status: 'succeeded', origin: 'fresh' }],
};

describe('getRunList', () => {
  it('필터를 그대로 넘기고 날짜를 문자열로 돌려준다', async () => {
    listRuns.mockResolvedValue([ITEM]);

    const result = await getRunList({ tab: 'active', pendingOnly: true, query: '스크롤' });

    expect(listRuns).toHaveBeenCalledWith(
      {},
      { tab: 'active', pendingOnly: true, query: '스크롤' },
    );
    expect(result).toEqual({
      ok: true,
      data: [
        expect.objectContaining({
          id: 'run_1',
          startedAt: '2026-09-13T03:00:00.000Z',
          finishedAt: null,
          steps: [{ name: 'evidence', status: 'succeeded', origin: 'fresh' }],
        }),
      ],
    });
  });

  it('조회가 던지면 RUN_LIST_FAILED 봉투', async () => {
    listRuns.mockRejectedValue(new Error('SQLITE_BUSY'));

    const result = await getRunList({ tab: 'done' });

    expect(result).toEqual({
      ok: false,
      error: { code: 'RUN_LIST_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });
});
