// 승인 = posts 복사 + 큐 완료 이동 + Run done — 실제 임시 SQLite·임시 DATA_DIR·임시 blog 폴더로 끝까지 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceBundle } from '../evidence/bundle.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import { LocalFsPostsWriter } from '../publish/PostsWriter.ts';
import { importQueueFromFile } from '../queue/importQueue.ts';
import { LocalFsStorage } from '../storage/LocalFsStorage.ts';
import { LINKEDIN_ARTIFACT } from '../steps/linkedinStep.ts';
import { PUBLISH_ARTIFACT } from '../steps/publishInfoStep.ts';
import { VELOG_ARTIFACT } from '../steps/velogStep.ts';
import { VERIFICATION_ARTIFACT } from '../steps/verifyStep.ts';
import { ZENN_ARTIFACT } from '../steps/zennStep.ts';
import { approveAndPublishRun, localDate, type ApprovePublishDeps } from './approvePublish.ts';
import {
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  STEP_STATUS,
  type RunStatus,
} from './stateMachine.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let root: string;
let prisma: PrismaClient;
let deps: ApprovePublishDeps;
let blogDir: string;
let artifacts: LocalFsArtifactStore;
let evidence: LocalFsEvidenceStore;

const NOW = new Date('2026-09-26T05:00:00Z');
const TODAY = localDate(NOW);
const SLUG = 'infinite-scroll';
const QUEUE = `# 큐

## 대기

- 무한 스크롤 (spacehome)
- 다른 주제

## 후보

## 보류

## 완료

- 2026-09-01 옛 글 (posts/old)
`;

const BUNDLE: EvidenceBundle = {
  version: 1,
  runId: 'run',
  topicId: 't',
  topicSlug: SLUG,
  collectedAt: NOW.toISOString(),
  items: [
    {
      commit: 'abcdef1234567',
      path: 'src/scroll.ts',
      lineRange: { start: 1, end: 2 },
      date: '2024-03-05T10:00:00+09:00',
      source: 'linked',
      redacted: true,
      truncated: false,
      snippet: 'const SECRET_SNIPPET = 1;',
    },
  ],
  analyses: [{ id: 'a1', kind: 'area', title: 'src 영역', summary: 'SUMMARY_TEXT' }],
  unreadable: 0,
  filtered: true,
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'galley-approve-publish-'));
  const url = `file:${join(root, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

let topicId: string;
let storage: LocalFsStorage;

beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
  blogDir = await mkdtemp(join(root, 'blog-'));
  const dataDir = await mkdtemp(join(root, 'data-'));
  await writeFile(join(blogDir, '주제_큐.md'), QUEUE, 'utf8');
  storage = new LocalFsStorage(blogDir);
  await importQueueFromFile({ storage, prisma });
  topicId = (await prisma.queueItem.findFirstOrThrow({ where: { status: '대기', order: 0 } })).id;
  artifacts = new LocalFsArtifactStore(dataDir);
  evidence = new LocalFsEvidenceStore(dataDir);
  deps = {
    prisma,
    artifacts,
    evidence,
    posts: new LocalFsPostsWriter(blogDir),
    storage,
    clock: { now: () => NOW },
  };
});

/** 6단계를 끝낸 Run(기본 승인 대기) + 그 Run의 DATA_DIR 산출물. */
async function finishedRun(
  options: { status?: RunStatus; carriedFrom?: string; withArtifacts?: boolean } = {},
) {
  const status = options.status ?? RUN_STATUS.pendingApproval;
  const attempts = await prisma.run.count({ where: { topicId } });
  const run = await prisma.run.create({
    data: {
      topicId,
      attempt: attempts + 1,
      topicSlug: SLUG,
      topicTitle: '무한 스크롤 (spacehome)',
      modelId: 'mock:default',
      status,
      finishedAt: status === RUN_STATUS.pendingApproval ? null : NOW,
      steps: {
        createMany: {
          data: STEP_ORDER.map((name, order) => ({
            name,
            order,
            status: STEP_STATUS.succeeded,
            // carriedFrom이 있으면 근거·본문은 그 Run이 만든 것(carried), 나머지는 이 Run.
            ...(options.carriedFrom !== undefined && (name === 'evidence' || name === 'velog')
              ? { origin: STEP_ORIGIN.carried, sourceRunId: options.carriedFrom }
              : {}),
          })),
        },
      },
    },
  });
  if (options.withArtifacts !== false) await writeArtifacts(run.id, '무한 스크롤 미리 불러오기');
  return run;
}

async function writeArtifacts(runId: string, title: string) {
  await artifacts.write(SLUG, runId, VELOG_ARTIFACT, `# ${title}\n\n본문 ${runId}\n`);
  await artifacts.write(SLUG, runId, LINKEDIN_ARTIFACT, `링크드인 ${runId}\n`);
  await artifacts.write(SLUG, runId, ZENN_ARTIFACT, `---\ntitle: "x"\n---\n\n本文\n`);
  await artifacts.write(SLUG, runId, VERIFICATION_ARTIFACT, `{"runId":"${runId}"}\n`);
  await artifacts.write(SLUG, runId, PUBLISH_ARTIFACT, `# 발행 정보 — ${title}\n\n## 근거\n`);
  await evidence.write({ ...BUNDLE, runId, topicId });
}

describe('approveAndPublishRun', () => {
  test('posts에 6개 파일, 큐 파일 완료 줄, QueueItem 완료(같은 행), Run done', async () => {
    const run = await finishedRun();

    const result = await approveAndPublishRun(deps, run.id);

    const dir = join(blogDir, 'posts', SLUG);
    expect(result).toMatchObject({
      ok: true,
      run: { id: run.id, status: RUN_STATUS.done },
      postsDir: dir,
    });
    expect((await readdir(dir)).sort()).toEqual(
      [
        '무한_스크롤_미리_불러오기.md',
        '무한_스크롤_미리_불러오기_링크드인.md',
        '무한_스크롤_미리_불러오기_zenn.md',
        '무한_스크롤_미리_불러오기_발행정보.md',
        'evidence.json',
        'verification.json',
      ].sort(),
    );
    expect(await readFile(join(dir, '무한_스크롤_미리_불러오기.md'), 'utf8')).toBe(
      `# 무한 스크롤 미리 불러오기\n\n본문 ${run.id}\n`,
    );
    // posts의 evidence.json은 포인터뿐 — 조각이 새지 않는다.
    const pointers = await readFile(join(dir, 'evidence.json'), 'utf8');
    expect(pointers).not.toContain('SECRET_SNIPPET');
    expect(JSON.parse(pointers).items[0]).toMatchObject({
      commit: 'abcdef1234567',
      path: 'src/scroll.ts',
    });
    // 분석 글 요약도 포인터가 아니다 — posts 사본에는 없다(리뷰 M2).
    expect(JSON.parse(pointers)).not.toHaveProperty('analyses');
    expect(pointers).not.toContain('SUMMARY_TEXT');

    // 큐 파일: 대기에서 빠지고 완료 맨 끝에 `날짜 글제목 (posts/슬러그)`.
    const queue = await readFile(join(blogDir, '주제_큐.md'), 'utf8');
    expect(queue).not.toContain('- 무한 스크롤 (spacehome)');
    expect(queue).toContain(
      `- 2026-09-01 옛 글 (posts/old)\n- ${TODAY} 무한 스크롤 미리 불러오기 (posts/${SLUG})\n`,
    );
    expect(queue).toContain('## 대기\n\n- 다른 주제\n');

    // DB: 같은 QueueItem 행이 완료가 됐고(재적재로 갈라지지 않음), Run은 done.
    const item = await prisma.queueItem.findUniqueOrThrow({ where: { id: topicId } });
    expect(item).toMatchObject({ status: '완료', completedOn: TODAY, missingSince: null });
    expect(await prisma.queueItem.count()).toBe(3);
    const after = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(after).toMatchObject({ status: RUN_STATUS.done, finishedAt: NOW, workerId: null });
  });

  test('carried 단계는 그 결과를 만든 Run의 산출물을 복사한다', async () => {
    const first = await finishedRun({ status: RUN_STATUS.revised });
    const second = await finishedRun({ carriedFrom: first.id, withArtifacts: false });
    // 두 번째 Run은 근거·본문을 이어받았으므로 자기 것은 나머지만.
    await artifacts.write(SLUG, second.id, LINKEDIN_ARTIFACT, `링크드인 ${second.id}\n`);
    await artifacts.write(SLUG, second.id, ZENN_ARTIFACT, `---\ntitle: "x"\n---\n\n本文\n`);
    await artifacts.write(SLUG, second.id, VERIFICATION_ARTIFACT, `{}\n`);
    await artifacts.write(
      SLUG,
      second.id,
      PUBLISH_ARTIFACT,
      `# 발행 정보 — 무한 스크롤 미리 불러오기\n`,
    );

    const result = await approveAndPublishRun(deps, second.id);

    expect(result.ok).toBe(true);
    const dir = join(blogDir, 'posts', SLUG);
    expect(await readFile(join(dir, '무한_스크롤_미리_불러오기.md'), 'utf8')).toContain(
      `본문 ${first.id}`,
    );
    expect(await readFile(join(dir, '무한_스크롤_미리_불러오기_링크드인.md'), 'utf8')).toContain(
      second.id,
    );
  });

  test('같은 슬러그 폴더가 있고 이 주제의 승인된 Run이 없으면 POSTS_DIR_EXISTS — 아무것도 바꾸지 않는다', async () => {
    const run = await finishedRun();
    const dir = join(blogDir, 'posts', SLUG);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '손으로.md'), 'x');

    const result = await approveAndPublishRun(deps, run.id);

    expect(result).toEqual({ ok: false, code: 'POSTS_DIR_EXISTS', detail: dir });
    expect(await readdir(dir)).toEqual(['손으로.md']);
    expect(await readFile(join(blogDir, '주제_큐.md'), 'utf8')).toBe(QUEUE);
    expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      RUN_STATUS.pendingApproval,
    );
  });

  test('이 주제의 승인된 Run이 같은 슬러그에 있으면 덮어쓴다(재승인)', async () => {
    const first = await finishedRun();
    expect((await approveAndPublishRun(deps, first.id)).ok).toBe(true);
    // 승인 뒤 주제는 완료 — 재실행·재승인 시나리오를 흉내내려면 큐를 대기로 되돌린다.
    await writeFile(join(blogDir, '주제_큐.md'), QUEUE, 'utf8');
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '무한 스크롤 (spacehome)', status: '대기', completedOn: null, order: 0 },
    });
    const second = await finishedRun();
    await artifacts.write(
      SLUG,
      second.id,
      VELOG_ARTIFACT,
      '# 무한 스크롤 미리 불러오기\n\n고친 본문\n',
    );

    const result = await approveAndPublishRun(deps, second.id);

    expect(result.ok).toBe(true);
    expect(
      await readFile(join(blogDir, 'posts', SLUG, '무한_스크롤_미리_불러오기.md'), 'utf8'),
    ).toContain('고친 본문');
  });

  test('산출물이 하나라도 없으면 ARTIFACT_MISSING(파일명) — 부작용 없음', async () => {
    const run = await finishedRun();
    await artifacts.remove(SLUG, run.id, ZENN_ARTIFACT);

    expect(await approveAndPublishRun(deps, run.id)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
      detail: ZENN_ARTIFACT,
    });
    await expect(readdir(join(blogDir, 'posts'))).rejects.toThrow();
  });

  test('근거 번들이 없으면 ARTIFACT_MISSING(evidence)', async () => {
    const run = await finishedRun();
    await evidence.remove(SLUG, run.id);
    expect(await approveAndPublishRun(deps, run.id)).toMatchObject({
      code: 'ARTIFACT_MISSING',
      detail: 'evidence',
    });
  });

  test('발행정보 첫 줄이 형식에 맞지 않으면(옛 Mock 산출물) PUBLISH_TITLE_MISSING', async () => {
    const run = await finishedRun();
    await artifacts.write(SLUG, run.id, PUBLISH_ARTIFACT, '# 무한 스크롤\n단계: publishInfo');
    expect(await approveAndPublishRun(deps, run.id)).toEqual({
      ok: false,
      code: 'PUBLISH_TITLE_MISSING',
    });
  });

  test('주제가 큐 파일에서 사라졌으면 TOPIC_NOT_IN_QUEUE — posts를 쓰지 않는다', async () => {
    const run = await finishedRun();
    await writeFile(join(blogDir, '주제_큐.md'), QUEUE.replace('- 무한 스크롤 (spacehome)\n', ''));

    expect(await approveAndPublishRun(deps, run.id)).toEqual({
      ok: false,
      code: 'TOPIC_NOT_IN_QUEUE',
      detail: '대기',
    });
    await expect(readdir(join(blogDir, 'posts'))).rejects.toThrow();
  });

  test('주제가 이미 완료면 TOPIC_NOT_IN_QUEUE(완료)', async () => {
    const run = await finishedRun();
    await prisma.queueItem.update({ where: { id: topicId }, data: { status: '완료' } });
    expect(await approveAndPublishRun(deps, run.id)).toMatchObject({
      code: 'TOPIC_NOT_IN_QUEUE',
      detail: '완료',
    });
  });

  test('큐 파일 쓰기가 실패하면 DB(QueueItem·Run)는 되돌아간다 — 파일 쓰기는 트랜잭션 안 마지막', async () => {
    const run = await finishedRun();
    const failing: ApprovePublishDeps = {
      ...deps,
      storage: {
        readQueueFile: () => storage.readQueueFile(),
        writeQueueFile: () => Promise.reject(new Error('EACCES: blog 폴더 쓰기 거부')),
      },
    };

    await expect(approveAndPublishRun(failing, run.id)).rejects.toThrow('EACCES');

    expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      RUN_STATUS.pendingApproval,
    );
    expect(await prisma.queueItem.findUniqueOrThrow({ where: { id: topicId } })).toMatchObject({
      status: '대기',
      title: '무한 스크롤 (spacehome)',
    });
    expect(await readFile(join(blogDir, '주제_큐.md'), 'utf8')).toBe(QUEUE);
  });

  test('그새 상태가 바뀌었으면(Run 갱신 0건) 롤백 — 큐 파일·QueueItem 그대로, NOT_PENDING_APPROVAL', async () => {
    const run = await finishedRun();
    const racing: ApprovePublishDeps = {
      ...deps,
      posts: {
        async write(input) {
          // posts를 쓰는 사이 수정 지시가 끼어들어 Run이 revised가 됐다.
          await prisma.run.update({ where: { id: run.id }, data: { status: RUN_STATUS.revised } });
          return deps.posts.write(input);
        },
      },
    };

    expect(await approveAndPublishRun(racing, run.id)).toEqual({
      ok: false,
      code: 'NOT_PENDING_APPROVAL',
    });
    expect(await prisma.queueItem.findUniqueOrThrow({ where: { id: topicId } })).toMatchObject({
      status: '대기',
    });
    expect(await readFile(join(blogDir, '주제_큐.md'), 'utf8')).toBe(QUEUE);
  });

  test('재적재가 던져도 승인은 성공이다(다음 요청이 다시 적재한다)', async () => {
    const run = await finishedRun();
    let reads = 0;
    const flaky: ApprovePublishDeps = {
      ...deps,
      storage: {
        readQueueFile: () => {
          reads += 1;
          // 첫 읽기는 승인 절차, 두 번째 읽기는 재적재.
          return reads === 2 ? Promise.reject(new Error('EBUSY')) : storage.readQueueFile();
        },
        writeQueueFile: (content) => storage.writeQueueFile(content),
      },
    };

    const result = await approveAndPublishRun(flaky, run.id);

    expect(result.ok).toBe(true);
    expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      RUN_STATUS.done,
    );
  });

  test('시리즈 편은 완료 줄이 태그를 유지하고 재적재 뒤에도 같은 행에 seriesKey·episodeNo가 남는다', async () => {
    const seriesQueue = QUEUE.replace(
      '- 무한 스크롤 (spacehome)',
      '- [A-2] 무한 스크롤 (spacehome)',
    );
    await writeFile(join(blogDir, '주제_큐.md'), seriesQueue, 'utf8');
    await importQueueFromFile({ storage, prisma });
    const run = await finishedRun();

    expect((await approveAndPublishRun(deps, run.id)).ok).toBe(true);

    const queue = await readFile(join(blogDir, '주제_큐.md'), 'utf8');
    expect(queue).toContain(`- ${TODAY} [A-2] 무한 스크롤 미리 불러오기 (posts/${SLUG})\n`);
    expect(await prisma.queueItem.findUniqueOrThrow({ where: { id: topicId } })).toMatchObject({
      status: '완료',
      seriesKey: 'A',
      episodeNo: 2,
    });
    expect(await prisma.queueItem.count()).toBe(3);
  });

  test.each([RUN_STATUS.running, RUN_STATUS.done, RUN_STATUS.failed, RUN_STATUS.revised])(
    '%s Run은 승인하지 못한다',
    async (status) => {
      const run = await finishedRun({ status });
      expect(await approveAndPublishRun(deps, run.id)).toEqual({
        ok: false,
        code: 'NOT_PENDING_APPROVAL',
      });
    },
  );

  test('없는 Run이면 RUN_NOT_FOUND', async () => {
    expect(await approveAndPublishRun(deps, 'no-such-run')).toEqual({
      ok: false,
      code: 'RUN_NOT_FOUND',
    });
  });
});

describe('localDate', () => {
  test('로컬 시간대의 YYYY-MM-DD', () => {
    const d = new Date(2026, 8, 26, 23, 30);
    expect(localDate(d)).toBe('2026-09-26');
  });
});
