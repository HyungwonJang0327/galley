import { describe, it, expect, vi, afterEach } from 'vitest';

const { loadQueueSections, FakeStorage } = vi.hoisted(() => ({
  loadQueueSections: vi.fn(),
  FakeStorage: class {
    constructor(readonly blogDir: string) {}
  },
}));

// 실제 파일·SQLite 대신 pipeline 경계만 가짜로 둔다(적재 자체는 pipeline 통합 테스트가 본다).
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  LocalFsStorage: FakeStorage,
  loadQueueSections,
}));

import { getQueueSections } from './queue-data';

const EMPTY = { 대기: [], 후보: [], 보류: [], 완료: [] };

afterEach(() => {
  vi.unstubAllEnvs();
  loadQueueSections.mockReset();
});

describe('getQueueSections', () => {
  it('BLOG_DIR이 없으면 로드하지 않고 BLOG_DIR_MISSING', async () => {
    vi.stubEnv('BLOG_DIR', '');

    const result = await getQueueSections();

    expect(result).toMatchObject({ ok: false, error: { code: 'BLOG_DIR_MISSING' } });
    expect(loadQueueSections).not.toHaveBeenCalled();
  });

  it('BLOG_DIR 폴더의 Storage로 로드해 섹션을 돌려준다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    loadQueueSections.mockResolvedValue(EMPTY);

    const result = await getQueueSections();

    expect(result).toEqual({ ok: true, data: EMPTY });
    expect(loadQueueSections.mock.calls[0]?.[0].storage).toMatchObject({ blogDir: 'blog-dir' });
  });

  it('로드가 실패하면 던지지 않고 QUEUE_LOAD_FAILED', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    loadQueueSections.mockRejectedValue(new Error('ENOENT'));

    const result = await getQueueSections();

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'QUEUE_LOAD_FAILED', message: expect.stringContaining('ENOENT') },
    });
  });
});
