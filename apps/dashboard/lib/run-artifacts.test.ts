import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { read, readBytes, readBundle, getRunWithSteps, constructed } = vi.hoisted(() => ({
  read: vi.fn(),
  readBytes: vi.fn(),
  readBundle: vi.fn(),
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
  VERIFICATION_ARTIFACT: 'verification.json',
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
  LocalFsEvidenceStore: class {
    read = readBundle;
  },
}));

import {
  getRunArtifacts,
  getRunThumbnail,
  getRunVerificationFlags,
  parseVerificationReport,
} from './run-artifacts';

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
  readBundle.mockResolvedValue({ ok: false, code: 'EVIDENCE_BUNDLE_MISSING' });
});

afterEach(() => {
  vi.unstubAllEnvs();
  read.mockReset();
  readBytes.mockReset();
  readBundle.mockReset();
  getRunWithSteps.mockReset();
});

const BUNDLE = {
  version: 1,
  runId: 'run_2',
  topicId: 'topic_1',
  topicSlug: '무한-스크롤',
  collectedAt: '2026-09-26T00:00:00.000Z',
  unreadable: 1,
  filtered: true,
  items: [
    {
      commit: 'abcdef0123456789',
      path: 'src/feed.ts',
      lineRange: { start: 10, end: 20 },
      date: '2026-03-01T09:00:00+09:00',
      source: 'linked',
      redacted: false,
      truncated: false,
      snippet: 'l1\nl2\nl3\nl4',
    },
    {
      commit: '1234567abcdef',
      path: 'src/api.ts',
      lineRange: { start: 1, end: 3 },
      date: '2026-04-02T00:00:00Z',
      source: 'discovered',
      note: '메모',
      redacted: true,
      truncated: true,
      snippet: 'only',
    },
    {
      commit: '999999999',
      path: 'src/x.ts',
      lineRange: { start: 5, end: 5 },
      date: '2026-05-01',
      source: 'linked',
      redacted: false,
      truncated: false,
      snippet: '',
    },
  ],
};

const REPORT = {
  version: 1,
  runId: 'run_2',
  topicSlug: '무한-스크롤',
  verifiedAt: '2026-09-26T00:00:00.000Z',
  sources: { velog: 'run_2', evidence: 'run_2' },
  claims: [
    {
      text: '3초',
      kind: 'number',
      status: 'supported',
      line: 12,
      evidenceRef: {
        commit: 'abcdef0123456789',
        path: 'src/feed.ts',
        lineRange: { start: 10, end: 20 },
      },
    },
    { text: '서술 A', kind: 'statement', status: 'uncertain', line: 30, reason: 'not-judged' },
    {
      text: 'src/nope.ts',
      kind: 'path',
      status: 'unsupported',
      line: 40,
      reason: 'not-in-evidence',
    },
    {
      text: '서술 B',
      kind: 'statement',
      status: 'unsupported',
      line: 8,
      reason: 'judged',
      note: '근거에 없음',
    },
  ],
  counts: { supported: 1, unsupported: 2, uncertain: 1 },
  cleanRoom: {
    threshold: 6,
    matches: [
      {
        evidenceRef: { commit: 'a', path: 'p', lineRange: { start: 1, end: 2 } },
        bodyLine: 3,
        snippetLine: 1,
        lines: 6,
      },
    ],
  },
  judge: { status: 'judged', model: 'mock', statements: 2 },
};

describe('getRunArtifacts', () => {
  it('성공한 단계만 이 Run의 파일로 읽는다(대기·실패 단계는 읽지 않는다)', async () => {
    const views = await getRunArtifacts(
      run([
        step('evidence', 'failed'),
        step('velog'),
        step('verify', 'pending'),
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
    expect(readBundle).not.toHaveBeenCalled();
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

  it('썸네일 파일이 없거나 확인이 던지면 URL 없이 본문만', async () => {
    expect((await getRunArtifacts(run([step('publishInfo')]))).publishInfo).toEqual({
      kind: 'markdown',
      text: '# publish.md',
    });

    readBytes.mockRejectedValue(new Error('EACCES'));
    expect((await getRunArtifacts(run([step('publishInfo')]))).publishInfo).toEqual({
      kind: 'markdown',
      text: '# publish.md',
    });
  });

  it('썸네일 URL은 Run id를 경로 인코딩한다', async () => {
    readBytes.mockResolvedValue({ ok: true, bytes: new Uint8Array([1]) });

    const views = await getRunArtifacts({ ...run([step('publishInfo')]), id: 'run/1 a' });

    expect(views.publishInfo).toMatchObject({ thumbnailUrl: '/api/runs/run%2F1%20a/thumbnail' });
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

    expect(
      await getRunArtifacts(run([step('evidence', 'failed'), step('velog', 'running')])),
    ).toEqual({});
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

describe('getRunArtifacts — 근거 수집·근거 검증(BE13)', () => {
  it('근거 번들은 출처 Run 파일에서 읽어 linked·discovered 수와 조각 미리보기(3줄·해시 7자·날짜)로', async () => {
    readBundle.mockResolvedValue({ ok: true, bundle: BUNDLE });

    const views = await getRunArtifacts(
      run([step('evidence', 'succeeded', { origin: 'carried', sourceRunId: 'run_1' })]),
    );

    expect(readBundle).toHaveBeenCalledWith('무한-스크롤', 'run_1');
    expect(views.evidence).toEqual({
      kind: 'evidence',
      evidence: {
        linked: 2,
        discovered: 1,
        unreadable: 1,
        filtered: true,
        items: [
          {
            path: 'src/feed.ts',
            commit: 'abcdef0',
            lineRange: { start: 10, end: 20 },
            date: '2026-03-01',
            source: 'linked',
            snippetPreview: ['l1', 'l2', 'l3'],
            hasMore: true,
            redacted: false,
            truncated: false,
          },
          {
            path: 'src/api.ts',
            commit: '1234567',
            lineRange: { start: 1, end: 3 },
            date: '2026-04-02',
            source: 'discovered',
            note: '메모',
            snippetPreview: ['only'],
            hasMore: false,
            redacted: true,
            truncated: true,
          },
          {
            path: 'src/x.ts',
            commit: '9999999',
            lineRange: { start: 5, end: 5 },
            date: '2026-05-01',
            source: 'linked',
            snippetPreview: [''],
            hasMore: false,
            redacted: false,
            truncated: false,
          },
        ],
      },
    });
  });

  it('번들 없음은 missing, 형식 불량·읽기 실패는 unavailable 문구', async () => {
    expect((await getRunArtifacts(run([step('evidence')]))).evidence).toEqual({ kind: 'missing' });

    readBundle.mockResolvedValue({ ok: false, code: 'EVIDENCE_BUNDLE_INVALID' });
    expect((await getRunArtifacts(run([step('evidence')]))).evidence).toEqual({
      kind: 'unavailable',
      message: '근거 번들 파일의 형식이 맞지 않습니다.',
    });

    readBundle.mockResolvedValue({ ok: false, code: 'EVIDENCE_BUNDLE_UNREADABLE' });
    expect((await getRunArtifacts(run([step('evidence')]))).evidence).toMatchObject({
      kind: 'unavailable',
    });
  });

  it('검증 리포트는 주장을 unsupported → uncertain → supported, 같은 상태는 줄 순으로', async () => {
    read.mockResolvedValue({ ok: true, text: JSON.stringify(REPORT) });

    const views = await getRunArtifacts(run([step('verify')]));

    expect(read).toHaveBeenCalledWith('무한-스크롤', 'run_2', 'verification.json');
    expect(views.verify).toMatchObject({
      kind: 'verification',
      verification: {
        counts: { supported: 1, unsupported: 2, uncertain: 1 },
        verbatimMatches: 1,
        judge: 'judged',
      },
    });
    if (views.verify?.kind !== 'verification') throw new Error('kind');
    expect(views.verify.verification.claims.map((c) => [c.status, c.line])).toEqual([
      ['unsupported', 8],
      ['unsupported', 40],
      ['uncertain', 30],
      ['supported', 12],
    ]);
    expect(views.verify.verification.claims[3]).toEqual({
      text: '3초',
      kind: 'number',
      status: 'supported',
      line: 12,
      evidenceRef: { path: 'src/feed.ts', commit: 'abcdef0', lineRange: { start: 10, end: 20 } },
    });
    expect(views.verify.verification.claims[0]).toMatchObject({
      reason: 'judged',
      note: '근거에 없음',
    });
  });

  it('검증 리포트 형식이 깨지면 unavailable, 파일 없음은 missing', async () => {
    read.mockResolvedValue({ ok: true, text: '{"version":2}' });
    expect((await getRunArtifacts(run([step('verify')]))).verify).toEqual({
      kind: 'unavailable',
      message: '검증 리포트(verification.json)의 형식이 맞지 않습니다.',
    });

    read.mockResolvedValue({ ok: false, code: 'ARTIFACT_MISSING' });
    expect((await getRunArtifacts(run([step('verify')]))).verify).toEqual({ kind: 'missing' });
  });
});

describe('parseVerificationReport', () => {
  it('version 1·counts 셋·claims 배열·cleanRoom.matches·judge.status가 있어야 한다', () => {
    expect(parseVerificationReport(JSON.stringify(REPORT))).toBeTruthy();
    expect(parseVerificationReport('not json')).toBeUndefined();
    expect(parseVerificationReport('[]')).toBeUndefined();
    expect(
      parseVerificationReport(JSON.stringify({ ...REPORT, counts: { supported: 1 } })),
    ).toBeUndefined();
    expect(
      parseVerificationReport(
        JSON.stringify({ ...REPORT, counts: { ...REPORT.counts, uncertain: -1 } }),
      ),
    ).toBeUndefined();
    expect(
      parseVerificationReport(JSON.stringify({ ...REPORT, claims: [{ text: 'x' }] })),
    ).toBeUndefined();
    expect(
      parseVerificationReport(
        JSON.stringify({ ...REPORT, claims: [{ ...REPORT.claims[0], status: 'weird' }] }),
      ),
    ).toBeUndefined();
    expect(parseVerificationReport(JSON.stringify({ ...REPORT, cleanRoom: {} }))).toBeUndefined();
    expect(parseVerificationReport(JSON.stringify({ ...REPORT, judge: {} }))).toBeUndefined();
  });

  it('화면이 쓰는 필드의 값 범위도 본다 — kind·reason·judge.status·evidenceRef 형태(리뷰 M2)', () => {
    const withClaim = (claim: object) =>
      parseVerificationReport(
        JSON.stringify({ ...REPORT, claims: [{ ...REPORT.claims[0], ...claim }] }),
      );
    expect(withClaim({ kind: 'weird' })).toBeUndefined();
    expect(withClaim({ reason: 'weird' })).toBeUndefined();
    expect(withClaim({ evidenceRef: 'abcdef' })).toBeUndefined();
    expect(withClaim({ evidenceRef: { commit: 'a', path: 'p' } })).toBeUndefined();
    expect(
      withClaim({ evidenceRef: { commit: 'a', path: 'p', lineRange: { start: 1 } } }),
    ).toBeUndefined();
    expect(withClaim({ note: 3 })).toBeUndefined();
    expect(withClaim({ reason: 'judge-missing', note: '메모' })).toBeTruthy();
    expect(
      parseVerificationReport(JSON.stringify({ ...REPORT, judge: { status: 'weird' } })),
    ).toBeUndefined();
    expect(
      parseVerificationReport(JSON.stringify({ ...REPORT, judge: { status: 'skipped' } })),
    ).toBeTruthy();
  });

  it('형식 불량은 예외 문구가 아니라 "형식이 맞지 않습니다"로(evidenceRef가 문자열이어도)', async () => {
    read.mockResolvedValue({
      ok: true,
      text: JSON.stringify({ ...REPORT, claims: [{ ...REPORT.claims[0], evidenceRef: 'abcdef' }] }),
    });
    expect((await getRunArtifacts(run([step('verify')]))).verify).toEqual({
      kind: 'unavailable',
      message: '검증 리포트(verification.json)의 형식이 맞지 않습니다.',
    });
  });
});

describe('getRunVerificationFlags — 목록 행', () => {
  const rows = [
    run([step('verify')]),
    {
      ...run([step('verify', 'succeeded', { origin: 'carried', sourceRunId: 'run_0' })]),
      id: 'run_3',
    },
    { ...run([step('verify', 'running')]), id: 'run_4' },
    { ...run([step('evidence')]), id: 'run_5' },
  ];

  it('성공한 검증 단계가 있는 Run만, carried는 출처 Run 파일에서 수를 읽는다', async () => {
    read.mockImplementation(async (_s: string, runId: string) =>
      runId === 'run_0'
        ? {
            ok: true,
            text: JSON.stringify({
              ...REPORT,
              counts: { supported: 5, unsupported: 0, uncertain: 2 },
            }),
          }
        : { ok: true, text: JSON.stringify(REPORT) },
    );

    expect(await getRunVerificationFlags(rows)).toEqual({
      run_2: { unsupported: 2, uncertain: 1 },
      run_3: { unsupported: 0, uncertain: 2 },
    });
    expect(read.mock.calls.map((c) => c[1])).toEqual(['run_2', 'run_0']);
  });

  it('파일 없음·형식 불량·예외인 행은 빠지고 나머지는 그린다. DATA_DIR이 없으면 빈 결과', async () => {
    read.mockImplementation(async (_s: string, runId: string) => {
      if (runId === 'run_0') throw new Error('EACCES');
      return { ok: false, code: 'ARTIFACT_MISSING' };
    });
    expect(await getRunVerificationFlags(rows)).toEqual({});

    read.mockResolvedValue({ ok: true, text: '{}' });
    expect(await getRunVerificationFlags(rows)).toEqual({});

    vi.stubEnv('DATA_DIR', '');
    constructed.length = 0;
    read.mockResolvedValue({ ok: true, text: JSON.stringify(REPORT) });
    expect(await getRunVerificationFlags(rows)).toEqual({});
    expect(constructed).toEqual([]);
  });

  it('읽을 행이 없으면 DATA_DIR을 해석하지 않는다', async () => {
    vi.stubEnv('DATA_DIR', '');
    expect(await getRunVerificationFlags([run([step('velog')])])).toEqual({});
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

  it('발행정보 단계가 성공하지 않은 Run은 파일을 읽지 않고 THUMBNAIL_MISSING(미리보기와 같은 판정)', async () => {
    getRunWithSteps.mockResolvedValue({
      id: 'run_2',
      topicSlug: '무한-스크롤',
      steps: [step('velog'), step('publishInfo', 'failed')],
    });

    expect(await getRunThumbnail('run_2')).toMatchObject({
      ok: false,
      error: { code: 'THUMBNAIL_MISSING' },
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
