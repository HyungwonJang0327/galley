import { describe, it, expect, vi, afterEach } from 'vitest';

const { approveRunById, reviseRunById, planRerunById, answerRunById } = vi.hoisted(() => ({
  answerRunById: vi.fn(),
  approveRunById: vi.fn(),
  reviseRunById: vi.fn(),
  planRerunById: vi.fn(),
}));

// DB·상태 전이는 어댑터·pipeline 테스트가 본다. 여기서는 HTTP 경계(본문 검증·상태 코드·봉투)만.
vi.mock('../../../../lib/run-commands', () => ({
  approveRunById,
  reviseRunById,
  planRerunById,
  answerRunById,
}));

import { POST as approve } from './approve/route';
import { POST as revise } from './revise/route';
import { POST as rerunPlan } from './rerun-plan/route';
import { POST as answer } from './answer/route';

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
  answerRunById.mockReset();
});

describe('POST /api/runs/[id]/approve', () => {
  it('승인되면 200과 실행을 돌려준다', async () => {
    approveRunById.mockResolvedValue({ ok: true, data: RUN });

    const response = await approve(request('approve'), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: RUN });
    expect(approveRunById).toHaveBeenCalledWith('run_1');
  });

  it('없는 실행은 404, 상태·산출물·폴더 충돌은 409, 설정·쓰기 실패는 500', async () => {
    for (const [code, status] of [
      ['RUN_NOT_FOUND', 404],
      ['NOT_PENDING_APPROVAL', 409],
      ['ARTIFACT_MISSING', 409],
      ['PUBLISH_TITLE_MISSING', 409],
      ['TOPIC_NOT_IN_QUEUE', 409],
      ['POSTS_DIR_EXISTS', 409],
      ['POSTS_WRITE_FAILED', 500],
      ['BLOG_DIR_MISSING', 500],
      ['DATA_DIR_MISSING', 500],
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

describe('POST /api/runs/[id]/answer', () => {
  it('답을 보내면 201과 새 실행을 돌려준다 — 채움만 글을 싣는다', async () => {
    answerRunById.mockResolvedValue({ ok: true, data: { run: RUN } });
    const answers = [
      { id: 'c1', kind: 'fill', text: '3만 건' },
      { id: 'u1', kind: 'keep', text: '무시되는 글' },
      { id: 'u2', kind: 'delete' },
    ];

    const response = await answer(request('answer', { answers }), context());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, data: { run: RUN } });
    expect(answerRunById).toHaveBeenCalledWith({
      runId: 'run_1',
      answers: [
        { id: 'c1', kind: 'fill', text: '3만 건' },
        { id: 'u1', kind: 'keep' },
        { id: 'u2', kind: 'delete' },
      ],
    });
  });

  it('삽화 다시 만들기(redo) 답도 받는다', async () => {
    answerRunById.mockResolvedValue({ ok: true, data: { run: RUN } });

    const response = await answer(
      request('answer', { answers: [{ id: 'i1', kind: 'redo' }] }),
      context(),
    );

    expect(response.status).toBe(201);
    expect(answerRunById).toHaveBeenCalledWith({
      runId: 'run_1',
      answers: [{ id: 'i1', kind: 'redo' }],
    });
  });

  it.each([
    ['JSON 아님', 'not json'],
    ['answers 없음', {}],
    ['항목이 객체 아님', { answers: ['c1'] }],
    ['모르는 종류', { answers: [{ id: 'c1', kind: 'rewrite' }] }],
    ['채움에 글 없음', { answers: [{ id: 'c1', kind: 'fill' }] }],
    ['id 없음', { answers: [{ kind: 'keep' }] }],
  ])('형식이 어긋나면 400: %s', async (_name, body) => {
    const response = await answer(request('answer', body), context());

    expect(response.status).toBe(400);
    expect(answerRunById).not.toHaveBeenCalled();
  });

  it('빈 답·빈 채움은 400, 목록이 바뀜·상태 충돌은 409, 없는 실행은 404, 그 밖은 500', async () => {
    for (const [code, status] of [
      ['ANSWERS_EMPTY', 400],
      ['ANSWER_INVALID', 400],
      ['REVIEW_QUESTION_UNKNOWN', 409],
      ['REVIEW_QUESTIONS_MISSING', 409],
      ['NOT_PENDING_APPROVAL', 409],
      ['RUN_NOT_FOUND', 404],
      ['RUN_ANSWER_FAILED', 500],
    ] as const) {
      answerRunById.mockResolvedValue({ ok: false, error: { code, message: 'x' } });
      const response = await answer(request('answer', { answers: [] }), context());
      expect(response.status).toBe(status);
    }
  });
});
