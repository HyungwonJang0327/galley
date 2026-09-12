// 실행 시작 통합 테스트: 실제 임시 SQLite에 queued Run이 생기는지, 실패할 때 아무것도 안 남는지.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { createModelRegistry } from '../model/ModelRegistry.ts';
import { RUN_STATUS } from './stateMachine.ts';
import { startRun } from './startRun.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-start-run-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

/** 큐 항목을 먼저 만든다 — 실행은 QueueItem.id로 시작한다. */
let topicId: string;

beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
  topicId = (await prisma.queueItem.create({ data: { title: '  무한 스크롤  ', order: 0 } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

/** 실행 시작은 모델을 고르기만 하고 호출하지 않는다 — generate는 부르면 실패하게 둔다. */
const adapter = (id: string, available: boolean): ModelAdapter => ({
  id,
  label: id,
  provider: 'mock',
  pricing: { inputPerMTok: 0, outputPerMTok: 0 },
  available,
  generate: () => Promise.reject(new Error('실행 시작은 모델을 호출하지 않는다')),
});

const registry = createModelRegistry({
  adapters: [
    adapter('mock:default', true),
    adapter('mock:other', true),
    adapter('mock:no-key', false),
  ],
  defaultId: 'mock:default',
  indexingDefaultId: 'mock:default',
});

const deps = () => ({ prisma, registry });

describe('startRun', () => {
  test('큐 항목 제목에서 슬러그를 만들고 queued Run을 넣는다', async () => {
    const result = await startRun(deps(), { topicId });

    expect(result).toMatchObject({
      ok: true,
      run: {
        topicId,
        attempt: 1,
        topicSlug: '무한-스크롤',
        topicTitle: '무한 스크롤',
        modelId: 'mock:default',
      },
    });

    const rows = await prisma.run.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workerState: 'queued',
      status: RUN_STATUS.running,
      finishedAt: null,
      workerId: null,
    });
  });

  test('modelId를 주면 기본 모델 대신 그 모델로 만든다', async () => {
    const result = await startRun(deps(), { topicId, modelId: 'mock:other' });

    expect(result).toMatchObject({ ok: true, run: { modelId: 'mock:other' } });
  });

  test('API 키 없는 모델이면 만들지 않는다', async () => {
    const result = await startRun(deps(), { topicId, modelId: 'mock:no-key' });

    expect(result).toEqual({ ok: false, code: 'MODEL_UNAVAILABLE' });
    expect(await prisma.run.count()).toBe(0);
  });

  test('레지스트리에 없는 모델이면 만들지 않는다', async () => {
    const result = await startRun(deps(), { topicId, modelId: 'mock:없음' });

    expect(result).toEqual({ ok: false, code: 'UNKNOWN_MODEL' });
    expect(await prisma.run.count()).toBe(0);
  });

  test('큐에 없는 주제면 거절한다', async () => {
    expect(await startRun(deps(), { topicId: 'no-such-topic' })).toEqual({
      ok: false,
      code: 'TOPIC_NOT_FOUND',
    });
    expect(await prisma.run.count()).toBe(0);
  });

  test('제목이 공백뿐이면 모델도 보지 않고 거절한다', async () => {
    const blank = await prisma.queueItem.create({ data: { title: '   ', order: 1 } });

    expect(await startRun(deps(), { topicId: blank.id })).toEqual({
      ok: false,
      code: 'EMPTY_TITLE',
    });
    expect(await prisma.run.count()).toBe(0);
  });

  test('같은 주제가 아직 끝나지 않았으면 또 만들지 않는다', async () => {
    await startRun(deps(), { topicId });

    expect(await startRun(deps(), { topicId })).toEqual({
      ok: false,
      code: 'RUN_ALREADY_ACTIVE',
    });
    expect(await prisma.run.count()).toBe(1);
  });

  test('끝난 실행만 있으면 다시 만들고 attempt가 올라간다', async () => {
    const first = await startRun(deps(), { topicId });
    if (!first.ok) throw new Error('첫 실행이 만들어져야 한다');
    await prisma.run.update({
      where: { id: first.run.id },
      data: { status: RUN_STATUS.done, finishedAt: new Date() },
    });

    expect(await startRun(deps(), { topicId })).toMatchObject({ ok: true, run: { attempt: 2 } });
    expect(await prisma.run.count()).toBe(2);
  });

  test('제목이 바뀌면 새 슬러그로 기록하지만 같은 주제로 이어진다', async () => {
    const first = await startRun(deps(), { topicId });
    if (!first.ok) throw new Error('첫 실행이 만들어져야 한다');
    await prisma.run.update({
      where: { id: first.run.id },
      data: { status: RUN_STATUS.done, finishedAt: new Date() },
    });
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '무한 스크롤 개선기' },
    });

    const second = await startRun(deps(), { topicId });

    // 슬러그는 그 실행이 쓴 폴더의 사실 기록이라 달라지지만, topicId가 키라 attempt는 이어진다.
    expect(second).toMatchObject({
      ok: true,
      run: { topicId, attempt: 2, topicSlug: '무한-스크롤-개선기' },
    });
  });
});
