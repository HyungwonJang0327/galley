import { describe, it, expect, vi, afterEach } from 'vitest';

const { getRunWithSteps } = vi.hoisted(() => ({ getRunWithSteps: vi.fn() }));

vi.mock('@galley/pipeline', () => ({ prisma: {}, getRunWithSteps }));

import { getRunDetail } from './run-detail';

afterEach(() => getRunWithSteps.mockReset());

const STEP = {
  name: 'evidence',
  order: 0,
  status: 'succeeded',
  origin: 'carried',
  sourceRunId: 'run_0',
  sourceFinishedAt: new Date('2026-09-12T01:00:00.000Z'),
  errorCode: null,
  errorMessage: null,
  attemptCount: 1,
  modelId: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  durationMs: 1200,
  startedAt: null,
  finishedAt: null,
};

const RUN = {
  id: 'run_1',
  topicId: 'topic_1',
  attempt: 2,
  topicSlug: '무한-스크롤',
  topicTitle: '무한 스크롤',
  status: 'pendingApproval',
  modelId: 'mock',
  startedAt: new Date('2026-09-13T03:00:00.000Z'),
  finishedAt: null,
  workerState: 'queued',
  heartbeat: new Date('2026-09-13T03:05:00.000Z'),
  instruction: '어투를 부드럽게',
  startStep: 'velog',
  steps: [STEP],
};

describe('getRunDetail', () => {
  it('실행·단계의 Date를 전부 ISO 문자열로', async () => {
    getRunWithSteps.mockResolvedValue(RUN);

    const result = await getRunDetail('run_1');

    expect(getRunWithSteps).toHaveBeenCalledWith({}, 'run_1');
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 'run_1',
        heartbeat: '2026-09-13T03:05:00.000Z',
        instruction: '어투를 부드럽게',
        steps: [
          expect.objectContaining({
            name: 'evidence',
            origin: 'carried',
            sourceFinishedAt: '2026-09-12T01:00:00.000Z',
            startedAt: null,
          }),
        ],
      }),
    });
  });

  it('없으면 RUN_NOT_FOUND', async () => {
    getRunWithSteps.mockResolvedValue(null);

    expect(await getRunDetail('nope')).toEqual({
      ok: false,
      error: { code: 'RUN_NOT_FOUND', message: '실행을 찾을 수 없습니다.' },
    });
  });

  it('조회가 던지면 RUN_DETAIL_FAILED 봉투', async () => {
    getRunWithSteps.mockRejectedValue(new Error('SQLITE_BUSY'));

    expect(await getRunDetail('run_1')).toEqual({
      ok: false,
      error: { code: 'RUN_DETAIL_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });
});
