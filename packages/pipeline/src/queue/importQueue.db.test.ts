// importQueueFromFile 통합 테스트: 실제 임시 SQLite로 매칭 upsert 동작을 검증한다.
// 핵심은 "재적재해도 id가 유지되는가"다 — id가 Run의 주제 키라 바뀌면 실행 이력이 끊긴다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { HOLD_REASON_REMOVED, disposeMissing, importQueueFromFile } from './importQueue';
import { RUN_STATUS } from '../run/stateMachine';
import type { Storage } from '../storage/Storage';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

function fakeStorage(content: string): Storage {
  return {
    readQueueFile: async () => content,
    writeQueueFile: async () => {},
  };
}

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-queue-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
});

/** 그 주제에 실행 하나를 붙인다(검수 상태만 다르게). */
const addRun = (topicId: string, status: string) =>
  prisma.run.create({
    data: { topicId, topicSlug: 'slug', topicTitle: 't', modelId: 'mock', status },
  });

const WAITING_ONLY = (titles: string[]) =>
  fakeStorage(
    `## 대기\n\n${titles.map((t) => `- ${t}`).join('\n')}\n\n## 후보\n\n## 보류\n\n## 완료\n`,
  );

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

describe('disposeMissing', () => {
  test('완료 Run이 있으면 그대로 둔다(파일 유무로 확정된 상태를 뒤집지 않는다)', () => {
    expect(disposeMissing({ runs: [{ status: RUN_STATUS.done }] })).toBe('keep-done');
  });

  test('Run이 있으면 확인을 받는다(제목 수정이 삭제+추가로 보일 수 있다)', () => {
    expect(disposeMissing({ runs: [{ status: RUN_STATUS.pendingApproval }] })).toBe(
      'await-confirm',
    );
  });

  test('Run이 없으면 조용히 보류로', () => {
    expect(disposeMissing({ runs: [] })).toBe('hold');
  });
});

describe('importQueueFromFile', () => {
  test('재적재해도 같은 줄의 id가 유지된다(Run의 주제 키라 바뀌면 이력이 끊긴다)', async () => {
    await importQueueFromFile({ storage: WAITING_ONLY(['A', 'B']), prisma });
    const before = await prisma.queueItem.findMany({ orderBy: { order: 'asc' } });

    await importQueueFromFile({ storage: WAITING_ONLY(['B', 'A']), prisma });
    const after = await prisma.queueItem.findMany({ orderBy: { order: 'asc' } });

    expect(after.map((i) => i.title)).toEqual(['B', 'A']);
    expect(after.map((i) => i.id).sort()).toEqual(before.map((i) => i.id).sort());
  });

  test('괄호 힌트만 고치면 같은 항목으로 남는다', async () => {
    await importQueueFromFile({ storage: WAITING_ONLY(['무한 스크롤 (spacehome)']), prisma });
    const [before] = await prisma.queueItem.findMany();

    await importQueueFromFile({
      storage: WAITING_ONLY(['무한 스크롤 (spacehome, react-router)']),
      prisma,
    });
    const items = await prisma.queueItem.findMany();

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(before?.id);
    expect(items[0]?.title).toBe('무한 스크롤 (spacehome, react-router)');
  });

  test('새 줄만 새로 만든다', async () => {
    await importQueueFromFile({ storage: WAITING_ONLY(['A']), prisma });
    const [first] = await prisma.queueItem.findMany();

    await importQueueFromFile({ storage: WAITING_ONLY(['A', 'B']), prisma });
    const items = await prisma.queueItem.findMany({ orderBy: { order: 'asc' } });

    expect(items.map((i) => i.title)).toEqual(['A', 'B']);
    expect(items[0]?.id).toBe(first?.id);
  });

  test('사라진 줄은 지우지 않는다 — Run이 없으면 보류 + 사유', async () => {
    await importQueueFromFile({ storage: WAITING_ONLY(['A', 'B']), prisma });

    await importQueueFromFile({ storage: WAITING_ONLY(['A']), prisma });

    const gone = await prisma.queueItem.findFirst({ where: { title: 'B' } });
    expect(gone).toMatchObject({ status: '보류', holdReason: HOLD_REASON_REMOVED });
    expect(gone?.missingSince).not.toBeNull();
  });

  test('Run이 붙은 줄이 사라지면 내리지 않고 표시만 한다(확인 대기)', async () => {
    await importQueueFromFile({ storage: WAITING_ONLY(['A']), prisma });
    const [item] = await prisma.queueItem.findMany();
    if (!item) throw new Error('항목이 있어야 한다');
    await addRun(item.id, RUN_STATUS.pendingApproval);

    await importQueueFromFile({ storage: WAITING_ONLY([]), prisma });

    const after = await prisma.queueItem.findUnique({ where: { id: item.id } });
    expect(after).toMatchObject({ status: '대기', holdReason: null });
    expect(after?.missingSince).not.toBeNull();
  });

  test('완료 Run이 있으면 사라져도 건드리지 않는다', async () => {
    await importQueueFromFile({ storage: WAITING_ONLY(['A']), prisma });
    const [item] = await prisma.queueItem.findMany();
    if (!item) throw new Error('항목이 있어야 한다');
    await addRun(item.id, RUN_STATUS.done);

    await importQueueFromFile({ storage: WAITING_ONLY([]), prisma });

    const after = await prisma.queueItem.findUnique({ where: { id: item.id } });
    expect(after).toMatchObject({ status: '대기', holdReason: null, missingSince: null });
  });

  test('줄이 돌아오면 사라짐 표시와 자동 보류 사유를 지운다', async () => {
    await importQueueFromFile({ storage: WAITING_ONLY(['A', 'B']), prisma });
    await importQueueFromFile({ storage: WAITING_ONLY(['A']), prisma });

    await importQueueFromFile({ storage: WAITING_ONLY(['A', 'B']), prisma });

    const back = await prisma.queueItem.findFirst({ where: { title: 'B' } });
    expect(back).toMatchObject({ status: '대기', holdReason: null, missingSince: null });
  });

  test('category·completedOn을 DB에 보존한다', async () => {
    const storage = fakeStorage(
      '## 대기\n\n## 후보\n\n### 카테고리1\n\n- 후보글\n\n## 보류\n\n## 완료\n\n- 2026-09-01 완료글\n',
    );
    await importQueueFromFile({ storage, prisma });

    const 후보 = await prisma.queueItem.findFirst({ where: { status: '후보' } });
    const 완료 = await prisma.queueItem.findFirst({ where: { status: '완료' } });
    expect(후보).toMatchObject({ title: '후보글', category: '카테고리1', completedOn: null });
    expect(완료).toMatchObject({ title: '완료글', category: null, completedOn: '2026-09-01' });
  });
});
