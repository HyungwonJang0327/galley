import { describe, it, expect, vi, afterEach } from 'vitest';

const { readTopicSeriesInfo, FakeStorage } = vi.hoisted(() => ({
  readTopicSeriesInfo: vi.fn(),
  FakeStorage: class {
    constructor(readonly blogDir: string) {}
  },
}));

vi.mock('@galley/pipeline', () => ({
  prisma: {},
  LocalFsStorage: FakeStorage,
  readTopicSeriesInfo,
}));

import { getRunSeries, runSeriesView } from './run-series';

afterEach(() => {
  vi.unstubAllEnvs();
  readTopicSeriesInfo.mockReset();
});

const INFO = {
  name: '앱 만들기',
  episodeNo: 2,
  total: 3,
  previous: { title: '첫 편', url: 'https://velog.io/@x/first' },
  next: { title: '셋째 편' },
  alreadyPublished: false,
};

describe('runSeriesView', () => {
  it('시리즈명 N/M편과 이전·다음 편 제목', () => {
    expect(runSeriesView(INFO)).toEqual({
      summary: '앱 만들기 시리즈 2/3편',
      previousTitle: '첫 편',
      nextTitle: '셋째 편',
    });
  });

  it('1편·마지막 편은 이전·다음이 비어 있다', () => {
    const only = { name: INFO.name, alreadyPublished: false };
    expect(runSeriesView({ ...only, episodeNo: 1, total: 1 })).toEqual({
      summary: '앱 만들기 시리즈 1/1편',
      previousTitle: undefined,
      nextTitle: undefined,
    });
  });
});

describe('getRunSeries', () => {
  it('BLOG_DIR의 Storage로 주제 id의 편 정보를 읽는다', async () => {
    vi.stubEnv('BLOG_DIR', 'blog-dir');
    readTopicSeriesInfo.mockResolvedValue(INFO);

    expect(await getRunSeries('topic_1')).toEqual(runSeriesView(INFO));
    expect(readTopicSeriesInfo.mock.calls[0]?.[0].storage).toMatchObject({ blogDir: 'blog-dir' });
    expect(readTopicSeriesInfo.mock.calls[0]?.[1]).toBe('topic_1');
  });

  it('시리즈가 아니거나 BLOG_DIR이 없거나 조회가 던지면 undefined(장식)', async () => {
    vi.stubEnv('BLOG_DIR', '');
    expect(await getRunSeries('topic_1')).toBeUndefined();
    expect(readTopicSeriesInfo).not.toHaveBeenCalled();

    vi.stubEnv('BLOG_DIR', 'blog-dir');
    readTopicSeriesInfo.mockResolvedValue(undefined);
    expect(await getRunSeries('topic_1')).toBeUndefined();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    readTopicSeriesInfo.mockRejectedValue(new Error('SQLITE_BUSY'));
    expect(await getRunSeries('topic_1')).toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[run-series]'), expect.any(Error));
    log.mockRestore();
  });
});
