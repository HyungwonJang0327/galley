import { describe, it, expect, vi, afterEach } from 'vitest';

const { reorderQueueTopic, FakeStorage } = vi.hoisted(() => ({
  reorderQueueTopic: vi.fn(),
  FakeStorage: class {
    constructor(readonly blogDir: string) {}
  },
}));

// 실제 파일·SQLite 대신 pipeline 경계만 가짜로 둔다(순서 변경 자체는 pipeline 테스트가 본다).
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  LocalFsStorage: FakeStorage,
  reorderQueueTopic,
}));

import { reorderQueueRow } from './queue-reorder';

const INPUT = { status: '대기', from: 2, to: 0, title: '주제' } as const;

afterEach(() => {
  vi.unstubAllEnvs();
  reorderQueueTopic.mockReset();
});

describe('reorderQueueRow', () => {
  it('BLOG_DIR이 없으면 바꾸지 않고 BLOG_DIR_MISSING', async () => {
    vi.stubEnv('BLOG_DIR', '');

    expect(await reorderQueueRow(INPUT)).toMatchObject({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING' },
    });
    expect(reorderQueueTopic).not.toHaveBeenCalled();
  });

  it('BLOG_DIR 폴더의 Storage로 순서를 바꾼다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    reorderQueueTopic.mockResolvedValue({ ok: true });

    expect(await reorderQueueRow(INPUT)).toEqual({ ok: true });
    expect(reorderQueueTopic.mock.calls[0]?.[0].storage).toMatchObject({ blogDir: 'blog-dir' });
    expect(reorderQueueTopic.mock.calls[0]?.[1]).toEqual(INPUT);
  });

  it('pipeline 실패 코드는 읽을 수 있는 문구로 바꾼다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    reorderQueueTopic.mockResolvedValue({ ok: false, code: 'TOPIC_MISMATCH' });

    expect(await reorderQueueRow(INPUT)).toEqual({
      ok: false,
      error: { code: 'TOPIC_MISMATCH', message: expect.stringContaining('그새 바뀌었습니다') },
    });
  });

  it('후보 섹션 거부도 읽을 수 있는 문구로 바꾼다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    reorderQueueTopic.mockResolvedValue({ ok: false, code: 'UNSUPPORTED_SECTION' });

    expect(await reorderQueueRow({ ...INPUT, status: '후보' })).toEqual({
      ok: false,
      error: { code: 'UNSUPPORTED_SECTION', message: expect.stringContaining('후보') },
    });
  });

  it('던지면 QUEUE_REORDER_FAILED로 감싼다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    reorderQueueTopic.mockRejectedValue(new Error('EACCES'));

    expect(await reorderQueueRow(INPUT)).toMatchObject({
      ok: false,
      error: { code: 'QUEUE_REORDER_FAILED', message: expect.stringContaining('EACCES') },
    });
  });
});
