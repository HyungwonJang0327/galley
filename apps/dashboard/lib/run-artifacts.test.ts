import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { read, constructed } = vi.hoisted(() => ({
  read: vi.fn(),
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
  resolveDataDir: (env: { DATA_DIR?: string }) =>
    env.DATA_DIR ? { ok: true, dir: env.DATA_DIR } : { ok: false, code: 'DATA_DIR_MISSING' },
  LocalFsArtifactStore: class {
    constructor(dir: string) {
      constructed.push(dir);
    }
    read = read;
  },
}));

import { getRunArtifacts } from './run-artifacts';

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
});

afterEach(() => {
  vi.unstubAllEnvs();
  read.mockReset();
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
