// reorderQueueTopic 통합 테스트: 실제 임시 SQLite + 메모리 Storage로 파일 재작성·DB 재적재를 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { reorderQueueTopic } from './reorderQueue';
import { parseQueue } from './queueFile';
import type { Storage } from '../storage/Storage';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

const SAMPLE = `# 큐

## 대기

- 대기 A
- 대기 B
- 대기 C

## 후보

## 보류

## 완료

- 2026-09-06 완료 A
`;

function memoryStorage(initial: string): Storage & { content: string } {
  return {
    content: initial,
    async readQueueFile() {
      return this.content;
    },
    async writeQueueFile(content: string) {
      this.content = content;
    },
  };
}

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-reorder-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

beforeEach(async () => {
  await prisma.queueItem.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

describe('reorderQueueTopic', () => {
  test('파일 줄 순서를 바꾸고 DB order도 그 순서로 다시 적재한다', async () => {
    const storage = memoryStorage(SAMPLE);

    const result = await reorderQueueTopic(
      { storage, prisma },
      { status: '대기', from: 2, to: 0, title: '대기 C' },
    );

    expect(result).toEqual({ ok: true });
    expect(parseQueue(storage.content).sections.대기.map((t) => t.title)).toEqual([
      '대기 C',
      '대기 A',
      '대기 B',
    ]);
    const rows = await prisma.queueItem.findMany({
      where: { status: '대기' },
      orderBy: { order: 'asc' },
    });
    expect(rows.map((r) => r.title)).toEqual(['대기 C', '대기 A', '대기 B']);
  });

  test('제목이 맞지 않으면 파일도 DB도 건드리지 않는다', async () => {
    const storage = memoryStorage(SAMPLE);

    const result = await reorderQueueTopic(
      { storage, prisma },
      { status: '대기', from: 0, to: 1, title: '그새 바뀐 제목' },
    );

    expect(result).toEqual({ ok: false, code: 'TOPIC_MISMATCH' });
    expect(storage.content).toBe(SAMPLE);
    expect(await prisma.queueItem.count()).toBe(0);
  });
});
