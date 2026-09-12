// moveQueueTopic 통합 테스트: 실제 임시 SQLite + 메모리 Storage로 파일 재작성과 DB 재적재를 함께 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { moveQueueTopic } from './moveQueue';
import { parseQueue } from './queueFile';
import type { Storage } from '../storage/Storage';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

const SAMPLE = `# 큐

## 대기

- 대기 A

## 후보

- 무카테고리 후보

### 프론트
- 프론트 후보

## 보류

## 완료

- 2026-09-06 완료 A
`;

/** 파일 대신 메모리에 두는 Storage(쓴 내용을 그대로 다시 읽는다). */
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
  dbDir = await mkdtemp(join(tmpdir(), 'galley-move-db-'));
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

describe('moveQueueTopic', () => {
  test('파일을 재작성하고 DB를 파일 기준으로 다시 적재한다', async () => {
    const storage = memoryStorage(SAMPLE);

    const result = await moveQueueTopic(
      { storage, prisma },
      { from: '후보', to: '대기', index: 0, title: '무카테고리 후보' },
    );

    expect(result).toEqual({ ok: true });
    // 파일: 대기 맨 아래로, 후보에서는 빠졌다. 완료일·preamble은 유지.
    const written = parseQueue(storage.content);
    expect(written.sections.대기.map((t) => t.title)).toEqual(['대기 A', '무카테고리 후보']);
    expect(written.sections.후보).toEqual([{ title: '프론트 후보', category: '프론트' }]);
    expect(written.sections.완료).toEqual([{ title: '완료 A', completedOn: '2026-09-06' }]);
    expect(storage.content.startsWith('# 큐')).toBe(true);
    // DB: 파일과 같은 상태
    const rows = await prisma.queueItem.findMany({
      orderBy: [{ status: 'asc' }, { order: 'asc' }],
    });
    expect(rows.filter((r) => r.status === '대기').map((r) => r.title)).toEqual([
      '대기 A',
      '무카테고리 후보',
    ]);
    expect(rows.filter((r) => r.status === '후보').map((r) => r.title)).toEqual(['프론트 후보']);
  });

  test('옮길 수 없으면 파일도 DB도 건드리지 않는다', async () => {
    const storage = memoryStorage(SAMPLE);

    const result = await moveQueueTopic(
      { storage, prisma },
      { from: '대기', to: '보류', index: 0, title: '그새 바뀐 제목' },
    );

    expect(result).toEqual({ ok: false, code: 'TOPIC_MISMATCH' });
    expect(storage.content).toBe(SAMPLE);
    expect(await prisma.queueItem.count()).toBe(0);
  });
});
