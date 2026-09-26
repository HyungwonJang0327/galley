// Run 조회 통합 테스트: 실제 임시 SQLite에 실행·단계를 넣고 개수·정렬을 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  countPendingApproval,
  findLatestRunForTopic,
  getRunWithSteps,
  listRecentRuns,
  listRuns,
} from './runQueries.ts';
import { RUN_STATUS, STEP_ORDER, STEP_ORIGIN, STEP_STATUS } from './stateMachine.ts';

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

/** 6행을 파이프라인 순서로 넣는다. overrides는 단계 이름 → 부분 값. */
const seedSteps = (
  runId: string,
  overrides: Partial<
    Record<(typeof STEP_ORDER)[number], Partial<Prisma.RunStepUncheckedCreateInput>>
  > = {},
) =>
  prisma.runStep.createMany({
    data: STEP_ORDER.map((name, order) => ({ runId, name, order, ...overrides[name] })),
  });

describe('listRuns — 실행 목록', () => {
  test('active 탭은 끝나지 않은 실행만, 시작 시각 최신순', async () => {
    await createRun({ topicSlug: 'old', startedAt: new Date('2026-09-01T00:00:00Z') });
    await createRun({
      topicSlug: 'new',
      status: RUN_STATUS.pendingApproval,
      startedAt: new Date('2026-09-03T00:00:00Z'),
    });
    await createRun({
      topicSlug: 'ended',
      status: RUN_STATUS.done,
      finishedAt: new Date('2026-09-04T00:00:00Z'),
    });

    const rows = await listRuns(prisma, { tab: 'active' });

    expect(rows.map((r) => r.topicSlug)).toEqual(['new', 'old']);
  });

  test('행의 단계에는 이름·상태·출처·sourceRunId가 온다(목록의 "근거 없음 n"이 출처 파일을 찾는다)', async () => {
    const first = await createRun({ status: RUN_STATUS.revised, finishedAt: new Date() });
    const second = await createRun({ attempt: 2, startStep: 'velog' });
    await seedSteps(second.id, {
      evidence: {
        status: STEP_STATUS.succeeded,
        origin: STEP_ORIGIN.carried,
        sourceRunId: first.id,
      },
    });

    const rows = await listRuns(prisma, { tab: 'active' });

    expect(rows[0]?.steps[0]).toEqual({
      name: 'evidence',
      status: 'succeeded',
      origin: 'carried',
      sourceRunId: first.id,
    });
    expect(rows[0]?.steps[1]).toEqual({
      name: 'velog',
      status: 'pending',
      origin: 'fresh',
      sourceRunId: null,
    });
  });

  test('done 탭은 종결된 실행만(승인·실패·수정 지시 전부), 종결 시각 최신순', async () => {
    await createRun({ topicSlug: 'running' });
    await createRun({
      topicSlug: 'done',
      status: RUN_STATUS.done,
      finishedAt: new Date('2026-09-02T00:00:00Z'),
    });
    await createRun({
      topicSlug: 'failed',
      status: RUN_STATUS.failed,
      finishedAt: new Date('2026-09-04T00:00:00Z'),
    });
    await createRun({
      topicSlug: 'revised',
      status: RUN_STATUS.revised,
      finishedAt: new Date('2026-09-03T00:00:00Z'),
    });

    const rows = await listRuns(prisma, { tab: 'done' });

    expect(rows.map((r) => r.topicSlug)).toEqual(['failed', 'revised', 'done']);
  });

  test('승인 대기만 체크하면 pendingApproval만 남는다', async () => {
    await createRun({ topicSlug: 'running', status: RUN_STATUS.running });
    await createRun({ topicSlug: 'pending', status: RUN_STATUS.pendingApproval });

    const rows = await listRuns(prisma, { tab: 'active', pendingOnly: true });

    expect(rows.map((r) => r.topicSlug)).toEqual(['pending']);
  });

  test('검색은 주제 제목 부분 일치, 공백만이면 무시', async () => {
    await createRun({ topicTitle: '무한 스크롤 개선기' });
    await createRun({ topicTitle: '다른 주제', topicId: topicB });

    expect(
      (await listRuns(prisma, { tab: 'active', query: '스크롤' })).map((r) => r.topicTitle),
    ).toEqual(['무한 스크롤 개선기']);
    expect(await listRuns(prisma, { tab: 'active', query: '   ' })).toHaveLength(2);
  });

  test('각 줄에 단계 6개가 순서대로 붙는다(진행 인디케이터용)', async () => {
    const run = await createRun();
    await seedSteps(run.id, {
      evidence: { status: STEP_STATUS.succeeded },
      velog: { status: STEP_STATUS.running },
    });

    const [row] = await listRuns(prisma, { tab: 'active' });

    expect(row?.steps.map((s) => s.name)).toEqual([...STEP_ORDER]);
    expect(row?.steps.map((s) => s.status)).toEqual([
      'succeeded',
      'running',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  test('limit만큼만', async () => {
    await createRun({ startedAt: new Date('2026-09-01T00:00:00Z') });
    await createRun({ startedAt: new Date('2026-09-02T00:00:00Z') });

    expect(await listRuns(prisma, { tab: 'active', limit: 1 })).toHaveLength(1);
  });
});

describe('getRunWithSteps — 실행 상세', () => {
  test('실행 + 단계 6행을 순서대로, 재실행 정보까지', async () => {
    const run = await createRun({
      attempt: 2,
      instruction: '어투를 부드럽게',
      startStep: 'velog',
      workerState: 'running',
    });
    await seedSteps(run.id, {
      velog: {
        status: STEP_STATUS.failed,
        errorCode: 'STEP_TIMEOUT',
        errorMessage: '10분 초과',
        attemptCount: 3,
        modelId: 'anthropic:claude-opus-5',
        inputTokens: 1200,
        outputTokens: 800,
        costUsd: 0.0123,
        durationMs: 600000,
      },
    });

    const detail = await getRunWithSteps(prisma, run.id);

    expect(detail).toMatchObject({
      id: run.id,
      attempt: 2,
      instruction: '어투를 부드럽게',
      startStep: 'velog',
      workerState: 'running',
    });
    expect(detail?.steps.map((s) => s.name)).toEqual([...STEP_ORDER]);
    expect(detail?.steps[1]).toMatchObject({
      name: 'velog',
      status: 'failed',
      errorCode: 'STEP_TIMEOUT',
      attemptCount: 3,
      inputTokens: 1200,
      costUsd: 0.0123,
      sourceRunId: null,
      sourceFinishedAt: null,
    });
  });

  test('carried 행은 출처 Run의 **그 단계** 종료 시각을 참조한다(Run 종결 시각이 아니다)', async () => {
    const producedAt = new Date('2026-09-10T01:00:00Z');
    const first = await createRun({
      attempt: 1,
      status: RUN_STATUS.revised,
      // 수정 지시 시각 — 결과 생산 시점과 다르다.
      finishedAt: new Date('2026-09-11T09:00:00Z'),
    });
    await seedSteps(first.id, {
      evidence: { status: STEP_STATUS.succeeded, finishedAt: producedAt },
      velog: { status: STEP_STATUS.succeeded, finishedAt: new Date('2026-09-10T02:00:00Z') },
    });
    const second = await createRun({ attempt: 2, startStep: 'velog' });
    await seedSteps(second.id, {
      evidence: {
        status: STEP_STATUS.succeeded,
        origin: STEP_ORIGIN.carried,
        sourceRunId: first.id,
      },
    });

    const detail = await getRunWithSteps(prisma, second.id);

    expect(detail?.steps[0]).toMatchObject({
      origin: 'carried',
      sourceRunId: first.id,
      sourceFinishedAt: producedAt,
    });
    expect(detail?.steps[1]?.sourceFinishedAt).toBeNull();
  });

  test('없는 실행이면 null', async () => {
    expect(await getRunWithSteps(prisma, 'no-such-run')).toBeNull();
  });
});
