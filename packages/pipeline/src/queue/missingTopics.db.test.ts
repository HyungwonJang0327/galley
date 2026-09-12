// 확인 대기 항목 통합 테스트: 실제 임시 SQLite + 임시 큐 파일.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  acknowledgeMissingTopic,
  listMissingTopics,
  restoreMissingTopicToHold,
} from './missingTopics';
import { importQueueFromFile } from './importQueue';
import { RUN_STATUS } from '../run/stateMachine';
import type { Storage } from '../storage/Storage';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

/** 내용을 메모리에 들고 있는 Storage — 쓰면 다음 읽기에 반영된다. */
function memoryStorage(initial: string): Storage & { content: string } {
  return {
    content: initial,
    async readQueueFile() {
      return this.content;
    },
    async writeQueueFile(next: string) {
      this.content = next;
    },
  };
}

const queueFile = (waiting: string[], hold: string[] = []) =>
  `## 대기\n\n${waiting.map((t) => `- ${t}`).join('\n')}\n\n## 후보\n\n## 보류\n\n${hold
    .map((t) => `- ${t}`)
    .join('\n')}\n\n## 완료\n`;

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-missing-db-'));
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

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

/** 줄 하나를 적재하고 Run을 붙인 뒤 파일에서 지워 "확인 대기"로 만든다. */
async function makePending(title: string, runStatus: string = RUN_STATUS.pendingApproval) {
  const storage = memoryStorage(queueFile([title]));
  await importQueueFromFile({ storage, prisma });
  const [item] = await prisma.queueItem.findMany();
  if (!item) throw new Error('적재되어야 한다');
  await prisma.run.create({
    data: {
      topicId: item.id,
      topicSlug: 'slug',
      topicTitle: item.title,
      modelId: 'mock',
      status: runStatus,
    },
  });
  storage.content = queueFile([]);
  await importQueueFromFile({ storage, prisma });
  return { storage, id: item.id };
}

describe('listMissingTopics', () => {
  test('확인 대기 항목을 실행 수와 함께 돌려준다', async () => {
    const { id } = await makePending('무한 스크롤 (spacehome)');

    const pending = await listMissingTopics(prisma);

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id, title: '무한 스크롤 (spacehome)', runCount: 1 });
    expect(pending[0]?.missingSince).toBeInstanceOf(Date);
  });

  test('답한 항목은 다시 묻지 않는다', async () => {
    const { id } = await makePending('무한 스크롤');
    await acknowledgeMissingTopic(prisma, id);

    expect(await listMissingTopics(prisma)).toEqual([]);
  });

  test('Run이 없어 조용히 보류로 내려간 항목은 목록에 없다', async () => {
    const storage = memoryStorage(queueFile(['A']));
    await importQueueFromFile({ storage, prisma });
    storage.content = queueFile([]);
    await importQueueFromFile({ storage, prisma });

    expect(await listMissingTopics(prisma)).toEqual([]);
    expect(await prisma.queueItem.findFirst({ where: { title: 'A' } })).toMatchObject({
      status: '보류',
    });
  });
});

describe('restoreMissingTopicToHold', () => {
  test('줄 원문 그대로 보류 섹션 끝에 되살린다', async () => {
    const { storage, id } = await makePending('무한 스크롤 (spacehome, react-router)');

    expect(await restoreMissingTopicToHold({ storage, prisma }, id)).toEqual({ ok: true });

    // 괄호 힌트가 살아 있어야 한다(제목에서 다시 만들면 사라진다).
    expect(storage.content).toContain('- 무한 스크롤 (spacehome, react-router)');
    const hold = storage.content.split('## 보류')[1]?.split('## 완료')[0] ?? '';
    expect(hold).toContain('무한 스크롤');
  });

  test('되살리면 확인 대기에서 빠지고 보류가 된다', async () => {
    const { storage, id } = await makePending('무한 스크롤');

    await restoreMissingTopicToHold({ storage, prisma }, id);

    expect(await listMissingTopics(prisma)).toEqual([]);
    const item = await prisma.queueItem.findUnique({ where: { id } });
    // 줄이 돌아왔으므로 매칭돼 표시가 저절로 비워진다 — 같은 id가 유지된다.
    expect(item).toMatchObject({ status: '보류', missingSince: null, missingAck: null });
  });

  test('이미 있던 보류 줄 뒤에 붙인다', async () => {
    const storage = memoryStorage(queueFile(['A'], ['먼저 있던 보류']));
    await importQueueFromFile({ storage, prisma });
    const a = await prisma.queueItem.findFirstOrThrow({ where: { title: 'A' } });
    await prisma.run.create({
      data: { topicId: a.id, topicSlug: 's', topicTitle: 'A', modelId: 'mock' },
    });
    storage.content = queueFile([], ['먼저 있던 보류']);
    await importQueueFromFile({ storage, prisma });

    await restoreMissingTopicToHold({ storage, prisma }, a.id);

    const hold = storage.content.split('## 보류')[1]?.split('## 완료')[0] ?? '';
    expect(hold.indexOf('먼저 있던 보류')).toBeLessThan(hold.indexOf('- A'));
  });

  test('완료 Run이 있으면 파일에 되살리지 않는다', async () => {
    // 완료 항목은 적재가 손대지 않으므로(keep-done) 확인 대기로 올라오지 않는다.
    // 이 가드는 다른 경로에서 직접 불렸을 때를 막는 것이라, 그 상태를 손으로 만든다.
    const { storage, id } = await makePending('무한 스크롤', RUN_STATUS.done);
    await prisma.queueItem.update({ where: { id }, data: { missingSince: new Date() } });
    const before = storage.content;

    expect(await restoreMissingTopicToHold({ storage, prisma }, id)).toEqual({
      ok: false,
      code: 'TOPIC_DONE',
    });
    expect(storage.content).toBe(before);
  });

  test('없는 주제·확인 대기가 아닌 주제는 거절한다', async () => {
    const storage = memoryStorage(queueFile(['A']));
    await importQueueFromFile({ storage, prisma });
    const a = await prisma.queueItem.findFirstOrThrow({ where: { title: 'A' } });

    expect(await restoreMissingTopicToHold({ storage, prisma }, 'nope')).toEqual({
      ok: false,
      code: 'TOPIC_NOT_FOUND',
    });
    expect(await restoreMissingTopicToHold({ storage, prisma }, a.id)).toEqual({
      ok: false,
      code: 'NOT_MISSING',
    });
  });
});

describe('acknowledgeMissingTopic', () => {
  test('파일을 건드리지 않고 다시 묻지 않게만 한다', async () => {
    const { storage, id } = await makePending('무한 스크롤');
    const before = storage.content;

    expect(await acknowledgeMissingTopic(prisma, id)).toEqual({ ok: true });

    expect(storage.content).toBe(before);
    const item = await prisma.queueItem.findUnique({ where: { id } });
    // 상태는 그대로 두고 확인 기록만 남는다 — 사라진 시각은 보존한다.
    expect(item).toMatchObject({ status: '대기', holdReason: null });
    expect(item?.missingAck).toBeInstanceOf(Date);
    expect(item?.missingSince).toBeInstanceOf(Date);
  });

  test('두 번 답할 수 없다', async () => {
    const { id } = await makePending('무한 스크롤');
    await acknowledgeMissingTopic(prisma, id);

    expect(await acknowledgeMissingTopic(prisma, id)).toEqual({ ok: false, code: 'NOT_MISSING' });
  });
});
