// importQueueFromFile 통합 테스트: 실제 임시 SQLite로 '전체 리셋' 동작을 검증한다.
// tmpdir에 DB 파일을 만들고 migrate deploy로 스키마를 세운 뒤 실제 PrismaClient를 쓴다.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { importQueueFromFile } from './importQueue';
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

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

describe('importQueueFromFile', () => {
  test('전체 리셋: 기존 행을 지우고 파일 상태로 교체한다', async () => {
    await prisma.queueItem.create({ data: { title: '옛항목', status: '대기', order: 0 } });

    const storage = fakeStorage('## 대기\n\n- A\n\n## 후보\n\n## 보류\n\n## 완료\n');
    await importQueueFromFile({ storage, prisma });

    const items = await prisma.queueItem.findMany();
    expect(items.map((i) => i.title)).toEqual(['A']);
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
