// Run 조회 통합 테스트: 실제 임시 SQLite에 실행·단계를 넣고 개수·정렬을 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from '@prisma/client';
import { countPendingApproval, findLatestRunForTopic, listRecentRuns } from './runQueries';
import { RUN_STATUS } from './stateMachine';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-run-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

/** 주제 두 개를 미리 만든다 — Run은 QueueItem.id를 키로 가리킨다. */
let topicA: string;
let topicB: string;

beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
  topicA = (await prisma.queueItem.create({ data: { title: '무한 스크롤', order: 0 } })).id;
  topicB = (await prisma.queueItem.create({ data: { title: '다른 주제', order: 1 } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

/** 관계 없이 스칼라만 넣는 형태로 고정한다 — 유니온이면 overrides 타입이 흐려진다. */
type RunSeed = Partial<Prisma.RunUncheckedCreateInput>;

const createRun = (overrides: RunSeed = {}) =>
  prisma.run.create({
    data: {
      topicId: topicA,
      topicSlug: '무한-스크롤',
      topicTitle: '무한 스크롤',
      modelId: 'anthropic:claude-opus-5',
      startedAt: new Date('2026-09-10T00:00:00Z'),
      ...overrides,
    },
  });

describe('Run 조회', () => {
  test('승인 대기 개수만 센다', async () => {
    await createRun({ status: RUN_STATUS.pendingApproval });
    await createRun({ status: RUN_STATUS.pendingApproval, topicId: topicB });
    await createRun({ status: RUN_STATUS.running });
    await createRun({ status: RUN_STATUS.done });

    expect(await countPendingApproval(prisma)).toBe(2);
  });

  test('실행이 없으면 0(홈·배지가 0으로 그린다)', async () => {
    expect(await countPendingApproval(prisma)).toBe(0);
  });

  test('최근 실행은 최신순으로, limit만큼', async () => {
    await createRun({ topicSlug: 'a', startedAt: new Date('2026-09-01T00:00:00Z') });
    await createRun({ topicSlug: 'b', startedAt: new Date('2026-09-03T00:00:00Z') });
    await createRun({ topicSlug: 'c', startedAt: new Date('2026-09-02T00:00:00Z') });

    expect((await listRecentRuns(prisma, 2)).map((r) => r.topicSlug)).toEqual(['b', 'c']);
  });

  test('주제의 마지막 시도를 찾는다(제목·슬러그가 바뀌어도 topicId가 키)', async () => {
    await createRun({ attempt: 1, topicSlug: '무한-스크롤' });
    // 제목을 다듬어 슬러그가 바뀐 두 번째 시도 — 같은 주제다.
    await createRun({ attempt: 2, topicSlug: '무한-스크롤-개선기' });
    await createRun({ topicId: topicB, topicSlug: '다른-주제' });

    const latest = await findLatestRunForTopic(prisma, topicA);

    expect(latest).toMatchObject({ attempt: 2, topicSlug: '무한-스크롤-개선기' });
  });

  test('없는 주제면 null', async () => {
    expect(await findLatestRunForTopic(prisma, 'no-such-topic')).toBeNull();
  });

  test('단계는 실행에 딸리고, 실행을 지우면 함께 지워진다', async () => {
    const run = await createRun();
    await prisma.runStep.createMany({
      data: [
        { runId: run.id, name: 'evidence', order: 0 },
        { runId: run.id, name: 'velog', order: 1 },
      ],
    });

    expect(await prisma.runStep.count()).toBe(2);
    await prisma.run.delete({ where: { id: run.id } });
    expect(await prisma.runStep.count()).toBe(0);
  });

  test('같은 실행에 같은 순서의 단계를 두 번 넣지 못한다', async () => {
    const run = await createRun();
    await prisma.runStep.create({ data: { runId: run.id, name: 'evidence', order: 0 } });

    await expect(
      prisma.runStep.create({ data: { runId: run.id, name: '중복', order: 0 } }),
    ).rejects.toThrow();
  });
});
