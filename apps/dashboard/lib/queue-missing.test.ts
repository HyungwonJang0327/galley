import { describe, it, expect, vi, afterEach } from 'vitest';

const { listMissingTopics, restoreMissingTopicToHold, acknowledgeMissingTopic, FakeStorage } =
  vi.hoisted(() => ({
    listMissingTopics: vi.fn(),
    restoreMissingTopicToHold: vi.fn(),
    acknowledgeMissingTopic: vi.fn(),
    FakeStorage: class {
      constructor(readonly blogDir: string) {}
    },
  }));

// 실제 SQLite·파일 대신 pipeline 경계만 가짜로 둔다(동작 자체는 pipeline 테스트가 본다).
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  LocalFsStorage: FakeStorage,
  listMissingTopics,
  restoreMissingTopicToHold,
  acknowledgeMissingTopic,
}));

import { getMissingTopics, keepMissingTopic, moveMissingTopicToHold } from './queue-missing';

afterEach(() => {
  vi.unstubAllEnvs();
  listMissingTopics.mockReset();
  restoreMissingTopicToHold.mockReset();
  acknowledgeMissingTopic.mockReset();
});

describe('getMissingTopics', () => {
  it('날짜를 문자열로 바꿔 돌려준다', async () => {
    listMissingTopics.mockResolvedValue([
      {
        id: 't1',
        title: '무한 스크롤 (spacehome)',
        missingSince: new Date('2026-09-12T01:02:03.000Z'),
        runCount: 2,
      },
    ]);

    expect(await getMissingTopics()).toEqual({
      ok: true,
      data: [
        {
          id: 't1',
          title: '무한 스크롤 (spacehome)',
          missingSince: '2026-09-12T01:02:03.000Z',
          runCount: 2,
        },
      ],
    });
  });

  it('던지지 않고 코드로 감싼다(큐 화면이 죽으면 안 된다)', async () => {
    listMissingTopics.mockRejectedValue(new Error('SQLITE_BUSY'));

    expect(await getMissingTopics()).toMatchObject({
      ok: false,
      error: { code: 'MISSING_LOAD_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });
});

describe('moveMissingTopicToHold', () => {
  it('BLOG_DIR이 없으면 파일을 건드리지 않는다', async () => {
    vi.stubEnv('BLOG_DIR', '');

    expect(await moveMissingTopicToHold('t1')).toMatchObject({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING' },
    });
    expect(restoreMissingTopicToHold).not.toHaveBeenCalled();
  });

  it('BLOG_DIR 폴더의 Storage로 되살린다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    restoreMissingTopicToHold.mockResolvedValue({ ok: true });

    expect(await moveMissingTopicToHold('t1')).toEqual({ ok: true });
    expect(restoreMissingTopicToHold.mock.calls[0]?.[0].storage).toMatchObject({
      blogDir: 'blog-dir',
    });
    expect(restoreMissingTopicToHold.mock.calls[0]?.[1]).toBe('t1');
  });

  it('완료 주제는 읽을 수 있는 문구로 거절한다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    restoreMissingTopicToHold.mockResolvedValue({ ok: false, code: 'TOPIC_DONE' });

    expect(await moveMissingTopicToHold('t1')).toEqual({
      ok: false,
      error: { code: 'TOPIC_DONE', message: expect.stringContaining('되살리지 않습니다') },
    });
  });
});

describe('keepMissingTopic', () => {
  it('BLOG_DIR 없이도 된다(파일을 건드리지 않는다)', async () => {
    vi.stubEnv('BLOG_DIR', '');
    acknowledgeMissingTopic.mockResolvedValue({ ok: true });

    expect(await keepMissingTopic('t1')).toEqual({ ok: true });
  });

  it('그새 상태가 바뀌었으면 문구로 알린다', async () => {
    acknowledgeMissingTopic.mockResolvedValue({ ok: false, code: 'NOT_MISSING' });

    expect(await keepMissingTopic('t1')).toEqual({
      ok: false,
      error: { code: 'NOT_MISSING', message: expect.stringContaining('그새') },
    });
  });
});
