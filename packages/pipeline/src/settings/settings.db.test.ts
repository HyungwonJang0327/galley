// 기본 모델 설정 통합 테스트: 실제 임시 SQLite에 저장·폴백이 맞는지.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { createModelRegistry } from '../model/ModelRegistry.ts';
import { getDefaultModel, setDefaultModelId, SETTING_KEY } from './settings.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-settings-db-'));
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

const adapter = (id: string, available: boolean): ModelAdapter => ({
  id,
  label: id,
  provider: 'mock',
  pricing: { inputPerMTok: 0, outputPerMTok: 0 },
  available,
  generate: () => Promise.reject(new Error('설정은 모델을 호출하지 않는다')),
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

describe('getDefaultModel', () => {
  test('저장값이 없으면 레지스트리 기본', async () => {
    expect((await getDefaultModel(prisma, registry)).id).toBe('mock:default');
  });

  test('저장값이 있으면 그 모델', async () => {
    await setDefaultModelId(prisma, registry, 'mock:other');

    expect((await getDefaultModel(prisma, registry)).id).toBe('mock:other');
  });

  test('레지스트리에서 빠진 id가 저장돼 있으면 레지스트리 기본으로 폴백한다', async () => {
    await prisma.setting.create({ data: { key: SETTING_KEY.defaultModelId, value: 'mock:gone' } });

    expect((await getDefaultModel(prisma, registry)).id).toBe('mock:default');
  });

  test('키 없는 모델은 폴백하지 않는다(사람이 고른 값 — 실행 시작이 알린다)', async () => {
    await setDefaultModelId(prisma, registry, 'mock:no-key');

    expect(await getDefaultModel(prisma, registry)).toMatchObject({
      id: 'mock:no-key',
      available: false,
    });
  });
});

describe('setDefaultModelId', () => {
  test('바꾸면 한 행을 덮어쓴다', async () => {
    expect(await setDefaultModelId(prisma, registry, 'mock:other')).toEqual({ ok: true });
    expect(await setDefaultModelId(prisma, registry, 'mock:default')).toEqual({ ok: true });

    expect(await prisma.setting.findMany()).toMatchObject([
      { key: 'defaultModelId', value: 'mock:default' },
    ]);
  });

  test('레지스트리에 없는 id는 저장하지 않는다', async () => {
    expect(await setDefaultModelId(prisma, registry, 'mock:없음')).toEqual({
      ok: false,
      code: 'UNKNOWN_MODEL',
    });
    expect(await prisma.setting.count()).toBe(0);
  });
});
