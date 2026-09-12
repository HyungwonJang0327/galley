import { describe, it, expect, vi, afterEach } from 'vitest';

const { moveQueueTopic, FakeStorage } = vi.hoisted(() => ({
  moveQueueTopic: vi.fn(),
  FakeStorage: class {
    constructor(readonly blogDir: string) {}
  },
}));

// 실제 파일·SQLite 대신 pipeline 경계만 가짜로 둔다(이동 자체는 pipeline 테스트가 본다).
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  LocalFsStorage: FakeStorage,
  moveQueueTopic,
}));

import { moveQueueRow } from './queue-move';

const INPUT = { from: '대기', to: '보류', index: 1, title: '주제' } as const;

afterEach(() => {
  vi.unstubAllEnvs();
  moveQueueTopic.mockReset();
});

describe('moveQueueRow', () => {
  it('BLOG_DIR이 없으면 옮기지 않고 BLOG_DIR_MISSING', async () => {
    vi.stubEnv('BLOG_DIR', '');

    expect(await moveQueueRow(INPUT)).toMatchObject({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING' },
    });
    expect(moveQueueTopic).not.toHaveBeenCalled();
  });

  it('BLOG_DIR 폴더의 Storage로 옮긴다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    moveQueueTopic.mockResolvedValue({ ok: true });

    expect(await moveQueueRow(INPUT)).toEqual({ ok: true });
    expect(moveQueueTopic.mock.calls[0]?.[0].storage).toMatchObject({ blogDir: 'blog-dir' });
    expect(moveQueueTopic.mock.calls[0]?.[1]).toEqual(INPUT);
  });

  it('pipeline 실패 코드는 읽을 수 있는 문구로 바꾼다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    moveQueueTopic.mockResolvedValue({ ok: false, code: 'TOPIC_MISMATCH' });

    expect(await moveQueueRow(INPUT)).toEqual({
      ok: false,
      error: { code: 'TOPIC_MISMATCH', message: expect.stringContaining('그새 바뀌었습니다') },
    });
  });

  it('던지면 QUEUE_MOVE_FAILED로 감싼다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    moveQueueTopic.mockRejectedValue(new Error('EACCES'));

    expect(await moveQueueRow(INPUT)).toMatchObject({
      ok: false,
      error: { code: 'QUEUE_MOVE_FAILED', message: expect.stringContaining('EACCES') },
    });
  });
});
