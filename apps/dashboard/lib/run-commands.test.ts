import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const { approveAndPublishRun, reviseRun, previewRerun, createModelRegistryFromEnv } = vi.hoisted(
  () => ({
    approveAndPublishRun: vi.fn(),
    reviseRun: vi.fn(),
    previewRerun: vi.fn(),
    createModelRegistryFromEnv: vi.fn(() => ({ registry: true })),
  }),
);

// 실제 SQLite·파일은 pipeline 테스트가 본다. 여기서는 코드→문구, 날짜 직렬화, 예외 봉투, 스토어 조립만.
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  approveAndPublishRun,
  reviseRun,
  previewRerun,
  createModelRegistryFromEnv,
  resolveDataDir: (env: { DATA_DIR?: string }) =>
    env.DATA_DIR ? { ok: true, dir: env.DATA_DIR } : { ok: false, code: 'DATA_DIR_MISSING' },
  LocalFsArtifactStore: class {
    constructor(public dir: string) {}
  },
  LocalFsEvidenceStore: class {
    constructor(public dir: string) {}
  },
  LocalFsPostsWriter: class {
    constructor(public dir: string) {}
  },
  LocalFsStorage: class {
    constructor(public dir: string) {}
  },
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
  approveAndPublishRun.mockReset();
  reviseRun.mockReset();
  previewRerun.mockReset();
  vi.unstubAllEnvs();
});

describe('approveRunById', () => {
  beforeEach(() => {
    vi.stubEnv('BLOG_DIR', '/blog');
    vi.stubEnv('DATA_DIR', '/data');
  });

  it('BLOG_DIR·DATA_DIR로 스토어를 조립해 넘기고, 종결 시각·posts 폴더를 돌려준다', async () => {
    approveAndPublishRun.mockResolvedValue({
      ok: true,
      run: { ...PREVIOUS, status: 'done' },
      postsDir: '/blog/posts/무한-스크롤',
      files: ['a.md'],
    });

    const result = await approveRunById('run_1');

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: 'run_1',
        status: 'done',
        startedAt: '2026-09-13T03:00:00.000Z',
        finishedAt: '2026-09-13T03:00:00.000Z',
        postsDir: '/blog/posts/무한-스크롤',
      }),
    });
    expect(approveAndPublishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma: {},
        artifacts: expect.objectContaining({ dir: '/data' }),
        evidence: expect.objectContaining({ dir: '/data' }),
        posts: expect.objectContaining({ dir: '/blog' }),
        storage: expect.objectContaining({ dir: '/blog' }),
      }),
      'run_1',
    );
  });

  it('BLOG_DIR이 없으면 부르지 않고 BLOG_DIR_MISSING, DATA_DIR이 규칙에 어긋나면 DATA_DIR_MISSING', async () => {
    vi.stubEnv('BLOG_DIR', '');
    expect(await approveRunById('run_1')).toMatchObject({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING' },
    });
    vi.stubEnv('BLOG_DIR', '/blog');
    vi.stubEnv('DATA_DIR', '');
    expect(await approveRunById('run_1')).toMatchObject({
      ok: false,
      error: { code: 'DATA_DIR_MISSING', message: expect.stringContaining('DATA_DIR_MISSING') },
    });
    expect(approveAndPublishRun).not.toHaveBeenCalled();
  });

  it('승인 대기가 아니면 한국어 문구를 붙인다', async () => {
    approveAndPublishRun.mockResolvedValue({ ok: false, code: 'NOT_PENDING_APPROVAL' });

    expect(await approveRunById('run_1')).toEqual({
      ok: false,
      error: { code: 'NOT_PENDING_APPROVAL', message: expect.stringContaining('승인 대기') },
    });
  });

  it('발행 준비 실패 코드는 detail을 문구에 끼운다', async () => {
    approveAndPublishRun.mockResolvedValue({
      ok: false,
      code: 'ARTIFACT_MISSING',
      detail: 'zenn.md',
    });
    expect(await approveRunById('run_1')).toEqual({
      ok: false,
      error: { code: 'ARTIFACT_MISSING', message: expect.stringContaining('zenn.md') },
    });

    approveAndPublishRun.mockResolvedValue({
      ok: false,
      code: 'POSTS_DIR_EXISTS',
      detail: '/blog/posts/x',
    });
    expect(await approveRunById('run_1')).toMatchObject({
      error: { code: 'POSTS_DIR_EXISTS', message: expect.stringContaining('/blog/posts/x') },
    });

    approveAndPublishRun.mockResolvedValue({
      ok: false,
      code: 'TOPIC_NOT_IN_QUEUE',
      detail: '완료',
    });
    expect(await approveRunById('run_1')).toMatchObject({
      error: { message: expect.stringContaining('이미 완료') },
    });
  });

  it('던져지면 RUN_APPROVE_FAILED로 감싼다', async () => {
    approveAndPublishRun.mockRejectedValue(new Error('SQLITE_BUSY'));

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
