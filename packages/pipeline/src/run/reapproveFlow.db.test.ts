// 완료한 주제를 되돌려 다시 쓰는 전체 흐름 — decisions/topic-slug.md "되돌리기 절차"를 실제 함수로 끝까지 본다:
// 적재 → 실행(startRun) → 산출물(Mock 러너가 DATA_DIR에) → 승인 → [완료 주제 실행 거절] → 파일에서 되돌리기(날짜만 뗌)
// → 재적재(같은 주제) → 실행(슬러그 승계) → 승인(같은 폴더 덮어쓰기). 임시 SQLite·DATA_DIR·blog 폴더.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { LocalFsReplacedStore } from '../artifacts/ReplacedStore.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { createModelRegistry } from '../model/ModelRegistry.ts';
import { LocalFsPostsWriter } from '../publish/PostsWriter.ts';
import { importQueueFromFile } from '../queue/importQueue.ts';
import { createMockStepRunner } from '../steps/MockStepRunner.ts';
import { LocalFsStorage } from '../storage/LocalFsStorage.ts';
import { approveAndPublishRun, localDate, type ApprovePublishDeps } from './approvePublish.ts';
import { RUN_STATUS, STEP_ORDER, STEP_STATUS } from './stateMachine.ts';
import { startRun } from './startRun.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const NOW = new Date('2026-09-27T05:00:00Z');
const TODAY = localDate(NOW);
const SLUG = '무한-스크롤';

const queue = (waiting: string, done: string) => `# 큐

## 대기

${waiting}- 다른 주제

## 후보

### 시리즈

시리즈 A. 노트 앱 만들기

## 보류

## 완료

${done}- 2026-09-01 옛 글 (posts/old)
`;

let root: string;
let prisma: PrismaClient;
let blogDir: string;
let queuePath: string;
let storage: LocalFsStorage;
let artifacts: LocalFsArtifactStore;
let evidence: LocalFsEvidenceStore;
let deps: ApprovePublishDeps;

const adapter: ModelAdapter = {
  id: 'mock:default',
  label: 'mock',
  provider: 'mock',
  pricing: { inputPerMTok: 0, outputPerMTok: 0 },
  available: true,
  generate: () => Promise.reject(new Error('이 테스트는 모델을 호출하지 않는다')),
};
const registry = createModelRegistry({
  adapters: [adapter],
  defaultId: 'mock:default',
  indexingDefaultId: 'mock:default',
});

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'galley-reapprove-'));
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

beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
  blogDir = await mkdtemp(join(root, 'blog-'));
  const dataDir = await mkdtemp(join(root, 'data-'));
  queuePath = join(blogDir, '주제_큐.md');
  await writeFile(queuePath, queue('- 무한 스크롤 (spacehome)\n', ''), 'utf8');
  storage = new LocalFsStorage(blogDir);
  await importQueueFromFile({ storage, prisma });
  artifacts = new LocalFsArtifactStore(dataDir);
  evidence = new LocalFsEvidenceStore(dataDir);
  deps = {
    prisma,
    artifacts,
    evidence,
    replaced: new LocalFsReplacedStore(dataDir),
    posts: new LocalFsPostsWriter(blogDir),
    storage,
    clock: { now: () => NOW },
  };
});

/** 워커 대신: Mock 러너로 6단계 산출물을 쓰고 Run을 승인 대기로 만든다. */
async function runToPendingApproval(runId: string, instruction?: string) {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });
  const runner = createMockStepRunner({
    stores: { artifacts, evidence },
    clock: { now: () => NOW },
  });
  for (const step of STEP_ORDER)
    await runner.run({
      runId,
      step,
      topic: { id: run.topicId, title: run.topicTitle, slug: run.topicSlug },
      modelId: run.modelId,
      sources: {},
      signal: new AbortController().signal,
      ...(instruction === undefined ? {} : { instruction }),
    });
  await prisma.run.update({
    where: { id: runId },
    data: {
      status: RUN_STATUS.pendingApproval,
      steps: {
        createMany: {
          data: STEP_ORDER.map((name, order) => ({ name, order, status: STEP_STATUS.succeeded })),
        },
      },
    },
  });
}

describe('되돌리기 → 재승인 흐름', () => {
  test('완료 줄을 대기로 옮기고 날짜만 떼면 같은 주제·같은 슬러그로 다시 쓰고 같은 폴더를 덮어쓴다', async () => {
    const topic = await prisma.queueItem.findFirstOrThrow({ where: { status: '대기', order: 0 } });

    // 1) 첫 실행 → 승인. 슬러그는 힌트를 뗀 제목에서.
    const first = await startRun({ prisma, registry }, { topicId: topic.id });
    if (!first.ok) throw new Error(first.code);
    expect(first.run.topicSlug).toBe(SLUG);
    await runToPendingApproval(first.run.id);
    expect(await approveAndPublishRun(deps, first.run.id)).toMatchObject({ ok: true });
    const completedLine = `- ${TODAY} 무한 스크롤 (posts/${SLUG})`;
    expect(await readFile(queuePath, 'utf8')).toContain(completedLine);

    // 2) 완료 주제는 실행하지 않는다.
    expect(await startRun({ prisma, registry }, { topicId: topic.id })).toEqual({
      ok: false,
      code: 'TOPIC_ALREADY_DONE',
    });

    // 3) 사람이 파일에서 되돌린다 — 완료 줄을 대기로 옮기고 날짜만 뗀다. 힌트는 다시 적어도 된다.
    await writeFile(queuePath, queue(`- 무한 스크롤 (posts/${SLUG}, spacehome)\n`, ''), 'utf8');
    await importQueueFromFile({ storage, prisma });
    const reverted = await prisma.queueItem.findUniqueOrThrow({ where: { id: topic.id } });
    expect(reverted).toMatchObject({ status: '대기', completedOn: null });
    // 같은 주제로 붙었다(새 행이 생기지 않았다) — 되돌린 줄의 힌트는 키워드로, posts 표기는 키워드가 아니다.
    expect(await prisma.queueItem.count({ where: { title: { contains: '무한 스크롤' } } })).toBe(1);
    expect(reverted.keywords).toBe('["spacehome"]');

    // 4) 다시 실행 → 같은 슬러그를 승계, 시도 번호가 이어진다.
    const second = await startRun({ prisma, registry }, { topicId: topic.id });
    if (!second.ok) throw new Error(second.code);
    expect(second.run).toMatchObject({ attempt: 2, topicSlug: SLUG });
    await runToPendingApproval(second.run.id, '도입부를 짧게');

    // 5) 재승인 → 같은 폴더를 덮어쓴다(새 폴더가 생기지 않는다).
    expect(await approveAndPublishRun(deps, second.run.id)).toMatchObject({
      ok: true,
      postsDir: join(blogDir, 'posts', SLUG),
    });
    expect(await readdir(join(blogDir, 'posts'))).toEqual([SLUG]);
    // Mock은 주제 제목을 글 제목으로 써서 이름이 같다 — 그대로 덮어쓴다. 글 제목이 바뀌는 재승인(옛 5개를 DATA_DIR로
    // 옮김)은 approvePublish.db.test.ts가 본다.
    expect(await readdir(join(blogDir, 'posts', SLUG))).toHaveLength(7);
    expect(await readFile(join(blogDir, 'posts', SLUG, '무한_스크롤.md'), 'utf8')).toContain(
      '도입부를 짧게',
    );
    const after = await readFile(queuePath, 'utf8');
    expect(after).toContain(completedLine);
    expect(after.match(/무한 스크롤/g)).toHaveLength(1);
    expect(await prisma.queueItem.findUniqueOrThrow({ where: { id: topic.id } })).toMatchObject({
      status: '완료',
    });
  });

  test('시리즈 편·줄 끝 URL이 있는 완료 줄도 날짜만 떼면 같은 주제로 붙고, 재승인한 완료 줄이 태그와 URL을 유지한다', async () => {
    const url = 'https://velog.io/@me/feed-model';
    await writeFile(queuePath, queue('- [A-1] 데이터 모델 (pono-web)\n', ''), 'utf8');
    await prisma.queueItem.deleteMany();
    await importQueueFromFile({ storage, prisma });
    const topic = await prisma.queueItem.findFirstOrThrow({ where: { seriesKey: 'A' } });

    const first = await startRun({ prisma, registry }, { topicId: topic.id });
    if (!first.ok) throw new Error(first.code);
    expect(first.run.topicSlug).toBe('데이터-모델');
    await runToPendingApproval(first.run.id);
    expect((await approveAndPublishRun(deps, first.run.id)).ok).toBe(true);
    expect(await readFile(queuePath, 'utf8')).toContain(
      `- ${TODAY} [A-1] 데이터 모델 (posts/데이터-모델)\n`,
    );

    // 사람이 발행 뒤 URL을 붙였고, 나중에 되돌린다 — 날짜만 떼고, 힌트는 기존 괄호 안에 쉼표로.
    await writeFile(
      queuePath,
      queue(`- [A-1] 데이터 모델 (posts/데이터-모델, pono-web) ${url}\n`, ''),
      'utf8',
    );
    await importQueueFromFile({ storage, prisma });
    expect(await prisma.queueItem.findUniqueOrThrow({ where: { id: topic.id } })).toMatchObject({
      status: '대기',
      seriesKey: 'A',
      episodeNo: 1,
    });

    const second = await startRun({ prisma, registry }, { topicId: topic.id });
    if (!second.ok) throw new Error(second.code);
    expect(second.run).toMatchObject({ attempt: 2, topicSlug: '데이터-모델' });
    await runToPendingApproval(second.run.id);
    expect((await approveAndPublishRun(deps, second.run.id)).ok).toBe(true);

    expect(await readFile(queuePath, 'utf8')).toContain(
      `- ${TODAY} [A-1] 데이터 모델 (posts/데이터-모델) ${url}\n`,
    );
    expect(await readdir(join(blogDir, 'posts'))).toEqual(['데이터-모델']);
  });

  test('날짜를 떼지 않고 옮기면 새 주제가 되고, 실행 전에 SLUG_TAKEN으로 막힌다', async () => {
    const topic = await prisma.queueItem.findFirstOrThrow({ where: { status: '대기', order: 0 } });
    const first = await startRun({ prisma, registry }, { topicId: topic.id });
    if (!first.ok) throw new Error(first.code);
    await runToPendingApproval(first.run.id);
    expect((await approveAndPublishRun(deps, first.run.id)).ok).toBe(true);

    await writeFile(queuePath, queue(`- ${TODAY} 무한 스크롤 (posts/${SLUG})\n`, ''), 'utf8');
    await importQueueFromFile({ storage, prisma });
    const fresh = await prisma.queueItem.findFirstOrThrow({
      where: { status: '대기', title: { startsWith: TODAY } },
    });
    expect(fresh.id).not.toBe(topic.id);

    expect(await startRun({ prisma, registry }, { topicId: fresh.id })).toEqual({
      ok: false,
      code: 'SLUG_TAKEN',
    });
    expect(await prisma.run.count({ where: { topicId: fresh.id } })).toBe(0);
  });

  test('되돌리면서 제목을 고치면 새 주제가 되고, 실행 전에 SLUG_TAKEN으로 막힌다(절차 3을 지켜야 하는 이유)', async () => {
    const topic = await prisma.queueItem.findFirstOrThrow({ where: { status: '대기', order: 0 } });
    const first = await startRun({ prisma, registry }, { topicId: topic.id });
    if (!first.ok) throw new Error(first.code);
    await runToPendingApproval(first.run.id);
    expect((await approveAndPublishRun(deps, first.run.id)).ok).toBe(true);

    // 제목 본문을 고쳐 되돌림 — 줄 텍스트 매칭이 끊긴다. 옛 행은 완료로 남는다(승인된 Run이 있어서).
    await writeFile(queuePath, queue(`- 무한 스크롤 다시 (posts/${SLUG})\n`, ''), 'utf8');
    await importQueueFromFile({ storage, prisma });
    const fresh = await prisma.queueItem.findFirstOrThrow({
      where: { status: '대기', title: { contains: '다시' } },
    });
    expect(fresh.id).not.toBe(topic.id);

    // 새 주제는 실행 기록이 없어 제목의 posts 표기를 슬러그로 쓰는데, 그 슬러그는 옛 주제의 승인된 Run 것이다 —
    // 6단계를 돌린 뒤 승인에서 POSTS_DIR_EXISTS가 되기 전에 실행을 거절한다.
    expect(await startRun({ prisma, registry }, { topicId: fresh.id })).toEqual({
      ok: false,
      code: 'SLUG_TAKEN',
    });
    expect(await prisma.run.count({ where: { topicId: fresh.id } })).toBe(0);
  });
});
