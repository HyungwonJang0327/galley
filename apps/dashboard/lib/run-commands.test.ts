import { describe, it, expect, vi, afterEach } from 'vitest';

const { approveRun, reviseRun, previewRerun, createModelRegistryFromEnv } = vi.hoisted(() => ({
  approveRun: vi.fn(),
  reviseRun: vi.fn(),
  previewRerun: vi.fn(),
  createModelRegistryFromEnv: vi.fn(() => ({ registry: true })),
}));

// 실제 SQLite는 pipeline 테스트가 본다. 여기서는 코드→문구, 날짜 직렬화, 예외 봉투만.
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  approveRun,
  reviseRun,
  previewRerun,
  createModelRegistryFromEnv,
}));

import { approveRunById, planRerunById, reviseRunById } from './run-commands';

const RUN = {
  id: 'run_2',
  topicId: 'topic_1',
  attempt: 2,
  topicSlug: '무한-스크롤',
  topicTitle: '무한 스크롤',
  status: 'running',
  modelId: 'mock',
  startedAt: new Date('2026-09-13T03:00:00.000Z'),
  finishedAt: null,
};
const PREVIOUS = {
  ...RUN,
  id: 'run_1',
  attempt: 1,
  status: 'revised',
  finishedAt: new Date('2026-09-13T03:00:00.000Z'),
};
const PLAN = { startStep: 'velog', fresh: ['velog', 'verify'], carried: ['evidence'] };

afterEach(() => {
  approveRun.mockReset();
  reviseRun.mockReset();
  previewRerun.mockReset();
});

describe('approveRunById', () => {
  it('종결 시각을 문자열로 돌려준다', async () => {
    approveRun.mockResolvedValue({ ok: true, run: { ...PREVIOUS, status: 'done' } });

    const result = await approveRunById('run_1');

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 'run_1',
        status: 'done',
        startedAt: '2026-09-13T03:00:00.000Z',
        finishedAt: '2026-09-13T03:00:00.000Z',
      }),
    });
    expect(approveRun).toHaveBeenCalledWith({}, 'run_1');
  });

  it('승인 대기가 아니면 한국어 문구를 붙인다', async () => {
    approveRun.mockResolvedValue({ ok: false, code: 'NOT_PENDING_APPROVAL' });

    expect(await approveRunById('run_1')).toEqual({
      ok: false,
      error: { code: 'NOT_PENDING_APPROVAL', message: expect.stringContaining('승인 대기') },
    });
  });

  it('던져지면 RUN_APPROVE_FAILED로 감싼다', async () => {
    approveRun.mockRejectedValue(new Error('SQLITE_BUSY'));

    expect(await approveRunById('run_1')).toEqual({
      ok: false,
      error: { code: 'RUN_APPROVE_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });
});

describe('reviseRunById', () => {
  it('직전·새 실행과 계획을 직렬화해 돌려준다', async () => {
    reviseRun.mockResolvedValue({ ok: true, previous: PREVIOUS, run: RUN, plan: PLAN });

    const result = await reviseRunById({ runId: 'run_1', instruction: '짧게', startStep: 'velog' });

    expect(result).toEqual({
      ok: true,
      data: {
        previous: expect.objectContaining({ id: 'run_1', status: 'revised' }),
        run: expect.objectContaining({ id: 'run_2', attempt: 2, finishedAt: null }),
        plan: PLAN,
      },
    });
    expect(reviseRun).toHaveBeenCalledWith(
      { prisma: {}, registry: { registry: true } },
      { runId: 'run_1', instruction: '짧게', startStep: 'velog' },
    );
  });

  it.each([
    ['NOT_LATEST_ATTEMPT', '최신 시도'],
    ['CARRIED_STEP_NOT_SUCCEEDED', '앞 단계'],
    ['INSTRUCTION_TOO_LONG', '너무 깁니다'],
    ['MODEL_UNAVAILABLE', 'API 키'],
  ])('%s → 문구에 "%s"', async (code, phrase) => {
    reviseRun.mockResolvedValue({ ok: false, code });

    expect(await reviseRunById({ runId: 'run_1', instruction: '' })).toEqual({
      ok: false,
      error: { code, message: expect.stringContaining(phrase) },
    });
  });

  it('던져지면 RUN_REVISE_FAILED로 감싼다', async () => {
    reviseRun.mockRejectedValue(new Error('disk full'));

    expect(await reviseRunById({ runId: 'run_1', instruction: '' })).toMatchObject({
      ok: false,
      error: { code: 'RUN_REVISE_FAILED' },
    });
  });
});

describe('planRerunById', () => {
  it('계획과 출처를 평평한 형태로 돌려준다', async () => {
    previewRerun.mockResolvedValue({
      ok: true,
      preview: { plan: PLAN, sources: { evidence: 'run_1' } },
    });

    expect(await planRerunById({ runId: 'run_1', instruction: '짧게' })).toEqual({
      ok: true,
      data: { ...PLAN, sources: { evidence: 'run_1' } },
    });
    expect(previewRerun).toHaveBeenCalledWith({}, { runId: 'run_1', instruction: '짧게' });
  });

  it('없는 실행이면 문구를 붙인다', async () => {
    previewRerun.mockResolvedValue({ ok: false, code: 'RUN_NOT_FOUND' });

    expect(await planRerunById({ runId: 'x', instruction: '' })).toEqual({
      ok: false,
      error: { code: 'RUN_NOT_FOUND', message: '실행을 찾을 수 없습니다.' },
    });
  });

  it('던져지면 RUN_RERUN_PLAN_FAILED로 감싼다', async () => {
    previewRerun.mockRejectedValue(new Error('boom'));

    expect(await planRerunById({ runId: 'x', instruction: '' })).toMatchObject({
      ok: false,
      error: { code: 'RUN_RERUN_PLAN_FAILED' },
    });
  });
});
