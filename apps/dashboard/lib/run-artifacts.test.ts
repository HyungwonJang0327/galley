import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { read, readBytes, getRunWithSteps, constructed } = vi.hoisted(() => ({
  read: vi.fn(),
  readBytes: vi.fn(),
  getRunWithSteps: vi.fn(),
  constructed: [] as string[],
}));

// 실제 파일은 pipeline ArtifactStore 테스트가 본다. 여기서는 단계 고르기·출처 Run·상태 매핑만.
vi.mock('@galley/pipeline', () => ({
  isStepName: (name: string) =>
    ['evidence', 'velog', 'verify', 'linkedin', 'zenn', 'publishInfo'].includes(name),
  STEP_ORIGIN: { fresh: 'fresh', carried: 'carried' },
  VELOG_ARTIFACT: 'velog.md',
  LINKEDIN_ARTIFACT: 'linkedin.md',
  ZENN_ARTIFACT: 'zenn.md',
  PUBLISH_ARTIFACT: 'publish.md',
  THUMBNAIL_ARTIFACT: 'thumbnail.png',
  prisma: {},
  getRunWithSteps,
  resolveDataDir: (env: { DATA_DIR?: string }) =>
    env.DATA_DIR ? { ok: true, dir: env.DATA_DIR } : { ok: false, code: 'DATA_DIR_MISSING' },
  LocalFsArtifactStore: class {
    constructor(dir: string) {
      constructed.push(dir);
    }
    read = read;
    readBytes = readBytes;
  },
}));

import { getRunArtifacts, getRunThumbnail } from './run-artifacts';

const step = (
  name: string,
  status = 'succeeded',
  extra: { origin?: string; sourceRunId?: string | null } = {},
) => ({ name, status, origin: extra.origin ?? 'fresh', sourceRunId: extra.sourceRunId ?? null });

const run = (steps: ReturnType<typeof step>[]) => ({
  id: 'run_2',
  topicSlug: '무한-스크롤',
  steps,
});

beforeEach(() => {
  vi.stubEnv('DATA_DIR', '/data');
  vi.stubEnv('BLOG_DIR', '/blog');
  constructed.length = 0;
  read.mockImplementation(async (_slug: string, _runId: string, name: string) => ({
    ok: true,
    text: `# ${name}`,
  }));
  readBytes.mockResolvedValue({ ok: false, code: 'ARTIFACT_MISSING' });
});

afterEach(() => {
  vi.unstubAllEnvs();
  read.mockReset();
  readBytes.mockReset();
  getRunWithSteps.mockReset();
});

describe('getRunArtifacts', () => {
  it('성공한 마크다운 단계만 이 Run의 파일로 읽는다(대기·실패·JSON 단계는 읽지 않는다)', async () => {
    const views = await getRunArtifacts(
      run([
        step('evidence'),
        step('velog'),
        step('verify'),
        step('linkedin', 'failed'),
        step('zenn', 'pending'),
        step('publishInfo'),
      ]),
    );

    expect(views).toEqual({
      velog: { kind: 'markdown', text: '# velog.md' },
      publishInfo: { kind: 'markdown', text: '# publish.md' },
    });
    expect(constructed).toEqual(['/data']);
    expect(read.mock.calls).toEqual([
      ['무한-스크롤', 'run_2', 'velog.md'],
      ['무한-스크롤', 'run_2', 'publish.md'],
    ]);
  });

  it('발행정보는 썸네일이 있을 때만 URL을 붙인다(출처 Run의 파일, 다른 단계는 확인하지 않는다)', async () => {
    readBytes.mockResolvedValue({ ok: true, bytes: new Uint8Array([1]) });

    const views = await getRunArtifacts(
      run([
        step('velog'),
        step('publishInfo', 'succeeded', { origin: 'carried', sourceRunId: 'run_1' }),
      ]),
    );

    expect(views.publishInfo).toEqual({
      kind: 'markdown',
      text: '# publish.md',
      thumbnailUrl: '/api/runs/run_2/thumbnail',
    });
    expect(views.velog).toEqual({ kind: 'markdown', text: '# velog.md' });
    expect(readBytes.mock.calls).toEqual([['무한-스크롤', 'run_1', 'thumbnail.png']]);
  });

  it('썸네일 파일이 없으면 URL 없이 본문만', async () => {
    const views = await getRunArtifacts(run([step('publishInfo')]));

    expect(views.publishInfo).toEqual({ kind: 'markdown', text: '# publish.md' });
  });

  it('carried 단계는 출처 Run의 파일을 읽는다', async () => {
    await getRunArtifacts(
      run([step('velog', 'succeeded', { origin: 'carried', sourceRunId: 'run_1' })]),
    );

    expect(read).toHaveBeenCalledWith('무한-스크롤', 'run_1', 'velog.md');
  });

  it('carried인데 출처가 없으면 이 Run에서 찾는다(없으면 missing으로 끝난다)', async () => {
    read.mockResolvedValue({ ok: false, code: 'ARTIFACT_MISSING' });

    const views = await getRunArtifacts(
      run([step('zenn', 'succeeded', { origin: 'carried', sourceRunId: null })]),
    );

    expect(read).toHaveBeenCalledWith('무한-스크롤', 'run_2', 'zenn.md');
    expect(views).toEqual({ zenn: { kind: 'missing' } });
  });

  it('읽을 단계가 없으면 DATA_DIR을 해석하지도, 스토어를 만들지도 않는다', async () => {
    vi.stubEnv('DATA_DIR', '');

    expect(await getRunArtifacts(run([step('evidence'), step('velog', 'running')]))).toEqual({});
    expect(constructed).toEqual([]);
  });

  it('DATA_DIR이 규칙에 안 맞으면 읽을 단계 전부 unavailable(문구 포함), 스토어 없음', async () => {
    vi.stubEnv('DATA_DIR', '');

    const views = await getRunArtifacts(run([step('velog'), step('linkedin')]));

    expect(views.velog).toMatchObject({
      kind: 'unavailable',
      message: expect.stringContaining('DATA_DIR'),
    });
    expect(views.linkedin).toEqual(views.velog);
    expect(constructed).toEqual([]);
  });

  it('없는 파일은 missing, 못 읽는 파일은 unavailable — 단계마다 따로', async () => {
    read.mockImplementation(async (_s: string, _r: string, name: string) =>
      name === 'velog.md'
        ? { ok: false, code: 'ARTIFACT_MISSING' }
        : { ok: false, code: 'ARTIFACT_UNREADABLE' },
    );

    const views = await getRunArtifacts(run([step('velog'), step('linkedin')]));

    expect(views).toEqual({
      velog: { kind: 'missing' },
      linkedin: { kind: 'unavailable', message: '산출물(linkedin.md)을 읽지 못했습니다.' },
    });
  });

  it('스토어가 던져도(경로로 못 쓰는 슬러그) 던지지 않고 그 단계만 unavailable', async () => {
    read.mockRejectedValue(new Error('topicSlug이(가) 파일 이름으로 쓸 수 없는 값이다'));

    const views = await getRunArtifacts({ ...run([step('velog')]), topicSlug: '../x' });

    expect(views.velog).toMatchObject({
      kind: 'unavailable',
      message: expect.stringContaining('파일 이름으로 쓸 수 없는 값'),
    });
  });
});

describe('getRunThumbnail', () => {
  const detail = (publishInfo: { origin: string; sourceRunId: string | null }) => ({
    id: 'run_2',
    topicSlug: '무한-스크롤',
    steps: [step('velog'), { name: 'publishInfo', status: 'succeeded', ...publishInfo }],
  });

  it('발행정보 출처 Run의 thumbnail.png 바이트를 돌려준다', async () => {
    getRunWithSteps.mockResolvedValue(detail({ origin: 'carried', sourceRunId: 'run_1' }));
    const bytes = new Uint8Array([137, 80]);
    readBytes.mockResolvedValue({ ok: true, bytes });

    expect(await getRunThumbnail('run_2')).toEqual({ ok: true, data: { bytes } });
    expect(readBytes).toHaveBeenCalledWith('무한-스크롤', 'run_1', 'thumbnail.png');
  });

  it('없는 실행은 RUN_NOT_FOUND, DATA_DIR 문제는 DATA_DIR_MISSING(파일은 읽지 않는다)', async () => {
    getRunWithSteps.mockResolvedValue(null);
    expect(await getRunThumbnail('nope')).toMatchObject({
      ok: false,
      error: { code: 'RUN_NOT_FOUND' },
    });

    vi.stubEnv('DATA_DIR', '');
    getRunWithSteps.mockResolvedValue(detail({ origin: 'fresh', sourceRunId: null }));
    expect(await getRunThumbnail('run_2')).toMatchObject({
      ok: false,
      error: { code: 'DATA_DIR_MISSING' },
    });
    expect(readBytes).not.toHaveBeenCalled();
  });

  it('파일 없음은 THUMBNAIL_MISSING, 읽기 실패는 THUMBNAIL_UNREADABLE, 예외는 RUN_THUMBNAIL_FAILED', async () => {
    getRunWithSteps.mockResolvedValue(detail({ origin: 'fresh', sourceRunId: null }));

    expect(await getRunThumbnail('run_2')).toMatchObject({
      ok: false,
      error: { code: 'THUMBNAIL_MISSING' },
    });
    expect(readBytes).toHaveBeenCalledWith('무한-스크롤', 'run_2', 'thumbnail.png');

    readBytes.mockResolvedValue({ ok: false, code: 'ARTIFACT_UNREADABLE' });
    expect(await getRunThumbnail('run_2')).toMatchObject({
      ok: false,
      error: { code: 'THUMBNAIL_UNREADABLE' },
    });

    getRunWithSteps.mockRejectedValue(new Error('SQLITE_BUSY'));
    expect(await getRunThumbnail('run_2')).toMatchObject({
      ok: false,
      error: { code: 'RUN_THUMBNAIL_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });
});
