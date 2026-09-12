import { describe, it, expect, vi, afterEach } from 'vitest';

const { approveRunById, reviseRunById, planRerunById } = vi.hoisted(() => ({
  approveRunById: vi.fn(),
  reviseRunById: vi.fn(),
  planRerunById: vi.fn(),
}));

// DB·상태 전이는 어댑터·pipeline 테스트가 본다. 여기서는 HTTP 경계(본문 검증·상태 코드·봉투)만.
vi.mock('../../../../lib/run-commands', () => ({ approveRunById, reviseRunById, planRerunById }));

import { POST as approve } from './approve/route';
import { POST as revise } from './revise/route';
import { POST as rerunPlan } from './rerun-plan/route';

const context = (id = 'run_1') => ({ params: Promise.resolve({ id }) });
const request = (path: string, body?: unknown) =>
  new Request(`http://localhost/api/runs/run_1/${path}`, {
    method: 'POST',
    body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
  });

const RUN = {
  id: 'run_1',
  topicId: 'topic_1',
  attempt: 1,
  topicSlug: '무한-스크롤',
  topicTitle: '무한 스크롤',
  status: 'done',
  modelId: 'mock',
  startedAt: '2026-09-13T03:00:00.000Z',
  finishedAt: '2026-09-13T03:10:00.000Z',
};

afterEach(() => {
  approveRunById.mockReset();
  reviseRunById.mockReset();
  planRerunById.mockReset();
});

describe('POST /api/runs/[id]/approve', () => {
  it('승인되면 200과 실행을 돌려준다', async () => {
    approveRunById.mockResolvedValue({ ok: true, data: RUN });

    const response = await approve(request('approve'), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: RUN });
    expect(approveRunById).toHaveBeenCalledWith('run_1');
  });

  it('없는 실행은 404, 승인 대기가 아니면 409, 그 밖은 500', async () => {
    for (const [code, status] of [
      ['RUN_NOT_FOUND', 404],
      ['NOT_PENDING_APPROVAL', 409],
      ['RUN_APPROVE_FAILED', 500],
    ] as const) {
      approveRunById.mockResolvedValue({ ok: false, error: { code, message: '문구' } });

      const response = await approve(request('approve'), context());

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ ok: false, error: { code, message: '문구' } });
    }
  });
});

describe('POST /api/runs/[id]/revise', () => {
  const REVISED = {
    previous: { ...RUN, status: 'revised' },
    run: { ...RUN, id: 'run_2', attempt: 2, status: 'running', finishedAt: null },
    plan: { startStep: 'velog', fresh: ['velog'], carried: ['evidence'] },
  };

  it('만들어지면 201과 직전·새 실행·계획을 돌려준다', async () => {
    reviseRunById.mockResolvedValue({ ok: true, data: REVISED });

    const response = await revise(
      request('revise', { instruction: '짧게', startStep: 'velog', modelId: 'mock' }),
      context(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: REVISED });
    expect(reviseRunById).toHaveBeenCalledWith({
      runId: 'run_1',
      instruction: '짧게',
      startStep: 'velog',
      modelId: 'mock',
    });
  });

  it('startStep·modelId가 없으면 넘기지 않는다(pipeline이 정한다)', async () => {
    reviseRunById.mockResolvedValue({ ok: true, data: REVISED });

    await revise(request('revise', { instruction: '' }), context());

    expect(reviseRunById).toHaveBeenCalledWith({ runId: 'run_1', instruction: '' });
  });

  it.each([
    ['JSON 아님', 'not json'],
    ['instruction 없음', {}],
    ['instruction이 문자열 아님', { instruction: 3 }],
    ['모르는 단계', { instruction: '', startStep: 'thumbnail' }],
    ['modelId가 문자열 아님', { instruction: '', modelId: 1 }],
  ])('%s → 400 INVALID_BODY', async (_label, body) => {
    const response = await revise(request('revise', body), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
    expect(reviseRunById).not.toHaveBeenCalled();
  });

  it.each([
    ['INSTRUCTION_TOO_LONG', 400],
    ['UNKNOWN_MODEL', 400],
    ['MODEL_UNAVAILABLE', 400],
    ['RUN_NOT_FOUND', 404],
    ['NOT_PENDING_APPROVAL', 409],
    ['NOT_LATEST_ATTEMPT', 409],
    ['CARRIED_STEP_NOT_SUCCEEDED', 409],
    ['RUN_REVISE_FAILED', 500],
  ])('%s → %i', async (code, status) => {
    reviseRunById.mockResolvedValue({ ok: false, error: { code, message: '문구' } });

    const response = await revise(request('revise', { instruction: '' }), context());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error: { code, message: '문구' } });
  });
});

describe('POST /api/runs/[id]/rerun-plan', () => {
  const PLAN = {
    startStep: 'velog',
    fresh: ['velog'],
    carried: ['evidence'],
    sources: { evidence: 'run_0' },
  };

  it('200과 계획을 돌려준다', async () => {
    planRerunById.mockResolvedValue({ ok: true, data: PLAN });

    const response = await rerunPlan(request('rerun-plan', { instruction: '짧게' }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: PLAN });
    expect(planRerunById).toHaveBeenCalledWith({ runId: 'run_1', instruction: '짧게' });
  });

  it('미리보기는 modelId를 받지 않는다', async () => {
    const response = await rerunPlan(
      request('rerun-plan', { instruction: '', modelId: 'mock' }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(planRerunById).not.toHaveBeenCalled();
  });

  it('없는 실행은 404, 너무 긴 지시는 400', async () => {
    planRerunById.mockResolvedValue({
      ok: false,
      error: { code: 'RUN_NOT_FOUND', message: '문구' },
    });
    expect((await rerunPlan(request('rerun-plan', { instruction: '' }), context())).status).toBe(
      404,
    );

    planRerunById.mockResolvedValue({
      ok: false,
      error: { code: 'INSTRUCTION_TOO_LONG', message: '문구' },
    });
    expect((await rerunPlan(request('rerun-plan', { instruction: '' }), context())).status).toBe(
      400,
    );
  });
});
