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

  test('슬러그는 괄호 힌트를 뗀 제목에서 만든다(리포 별칭이 폴더 이름으로 나가지 않는다)', async () => {
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '무한 스크롤 (spacehome, 2024.03)' },
    });

    expect(await startRun(deps(), { topicId })).toMatchObject({
      ok: true,
      run: { topicSlug: '무한-스크롤', topicTitle: '무한 스크롤 (spacehome, 2024.03)' },
    });
  });

  test('실행 기록이 없는 주제의 제목에 (posts/<슬러그>)가 있으면 그 슬러그를 쓴다(DB 초기화 뒤 되돌린 줄)', async () => {
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '무한 스크롤 미리 불러오기 (posts/무한-스크롤) https://velog.io/@me/x' },
    });

    expect(await startRun(deps(), { topicId })).toMatchObject({
      ok: true,
      run: { attempt: 1, topicSlug: '무한-스크롤' },
    });
  });

  test('슬러그 모양이 아닌 posts 표기는 읽지 않고 제목에서 파생한다', async () => {
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '라우팅 정리 (posts/[id] 라우트, posts/a/b)' },
    });

    expect(await startRun(deps(), { topicId })).toMatchObject({
      ok: true,
      run: { topicSlug: '라우팅-정리' },
    });
  });

  test('승인 뒤 완료 줄을 되돌려 실행하면(글 제목이 주제 제목과 달라도) 같은 슬러그를 승계한다', async () => {
    const first = await startRun(deps(), { topicId });
    if (!first.ok) throw new Error('첫 실행이 만들어져야 한다');
    await prisma.run.update({
      where: { id: first.run.id },
      data: { status: RUN_STATUS.done, finishedAt: new Date() },
    });
    // 승인이 바꾼 제목(completedTitle) 그대로 대기로 되돌린 상태.
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '무한 스크롤 미리 불러오기 (posts/무한-스크롤)', status: '대기' },
    });

    expect(await startRun(deps(), { topicId })).toMatchObject({
      ok: true,
      run: { attempt: 2, topicSlug: '무한-스크롤' },
    });
  });

  const pastRun = (attempt: number, topicSlug: string, status: string) =>
    prisma.run.create({
      data: {
        topicId,
        attempt,
        topicSlug,
        topicTitle: '무한 스크롤 (spacehome)',
        modelId: 'mock:default',
        status,
        finishedAt: new Date(),
      },
    });

  test('승인된 실행이 없으면 가장 최근 시도의 슬러그를 승계한다(옛 힌트 포함 슬러그도 그대로)', async () => {
    await pastRun(1, '옛-슬러그-a', RUN_STATUS.failed);
    await pastRun(2, '무한-스크롤-spacehome', RUN_STATUS.failed);

    expect(await startRun(deps(), { topicId })).toMatchObject({
      ok: true,
      run: { attempt: 3, topicSlug: '무한-스크롤-spacehome' },
    });
  });

  test('슬러그가 섞인 주제는 승인된 실행의 슬러그가 우선이다(posts 폴더가 있는 쪽)', async () => {
    await pastRun(1, '승인된-슬러그-옛것', RUN_STATUS.done);
    await pastRun(2, '승인된-슬러그', RUN_STATUS.done);
    await pastRun(3, '그-뒤-실패한-슬러그', RUN_STATUS.failed);

    expect(await startRun(deps(), { topicId })).toMatchObject({
      ok: true,
      run: { attempt: 4, topicSlug: '승인된-슬러그' },
    });
  });

  test('승계가 제목의 posts 표기보다 우선이다', async () => {
    await pastRun(1, '기록된-슬러그', RUN_STATUS.done);
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '무한 스크롤 (posts/다른-슬러그)' },
    });

    expect(await startRun(deps(), { topicId })).toMatchObject({
      ok: true,
      run: { topicSlug: '기록된-슬러그' },
    });
  });

  test('괄호 힌트뿐인 제목은 빈 제목으로 거절한다(슬러그가 topic으로 뭉치지 않게)', async () => {
    await prisma.queueItem.update({ where: { id: topicId }, data: { title: '(spacehome)' } });

    expect(await startRun(deps(), { topicId })).toEqual({ ok: false, code: 'EMPTY_TITLE' });
    expect(await prisma.run.count()).toBe(0);
  });

  test('제목이 바뀌어도 같은 주제면 슬러그를 승계하고 attempt가 이어진다(주제당 폴더 하나)', async () => {
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

    // topicId가 키라 attempt가 이어지고, 슬러그는 첫 실행이 정한 것을 그대로 쓴다. topicTitle은 지금 제목.
    expect(second).toMatchObject({
      ok: true,
      run: { topicId, attempt: 2, topicSlug: '무한-스크롤', topicTitle: '무한 스크롤 개선기' },
    });
  });
});
