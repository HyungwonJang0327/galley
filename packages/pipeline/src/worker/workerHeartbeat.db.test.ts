// 워커 생존 heartbeat 통합 테스트: 실제 임시 SQLite의 Setting 한 줄에 덮어쓰고 읽는지.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { SETTING_KEY } from '../settings/settings.ts';
import { readWorkerHeartbeat, writeWorkerHeartbeat } from './workerHeartbeat.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-worker-heartbeat-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

beforeEach(async () => {
  await prisma.setting.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

describe('워커 heartbeat', () => {
  test('쓴 적 없으면 null', async () => {
    expect(await readWorkerHeartbeat(prisma)).toBeNull();
  });

  test('덮어쓰기 — 줄은 하나, 마지막 시각만 남는다', async () => {
    await writeWorkerHeartbeat(prisma, new Date('2026-11-03T12:00:00.000Z'));
    await writeWorkerHeartbeat(prisma, new Date('2026-11-03T12:00:05.000Z'));
    expect(await readWorkerHeartbeat(prisma)).toEqual(new Date('2026-11-03T12:00:05.000Z'));
    expect(await prisma.setting.count()).toBe(1);
  });

  test('값이 시각이 아니면 null(죽은 것으로)', async () => {
    await prisma.setting.create({ data: { key: SETTING_KEY.workerHeartbeat, value: 'garbage' } });
    expect(await readWorkerHeartbeat(prisma)).toBeNull();
  });
});
