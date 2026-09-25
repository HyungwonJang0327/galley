// 워커의 시리즈 조회 어댑터 — 실제 임시 SQLite + 메모리 큐 파일.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { importQueueFromFile } from '../queue/importQueue.ts';
import type { Storage } from '../storage/Storage.ts';
import { createSeriesSource } from './seriesSource.ts';
import { StepFailure } from './StepRunner.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

const storageOf = (content: string): Storage => ({
  readQueueFile: async () => content,
  writeQueueFile: async () => {},
});

const QUEUE = `## 대기

- [A-2] 둘째 편
- 일반 주제

## 후보

### 시리즈

시리즈 A. 앱 만들기 (ja: アプリ)

## 보류

## 완료

- 2026-09-20 [A-1] 첫 편 (posts/first) https://velog.io/@x/first
`;

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-series-source-'));
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
  await importQueueFromFile({ storage: storageOf(QUEUE), prisma });
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

const idOf = async (title: string) =>
  (await prisma.queueItem.findFirstOrThrow({ where: { title } })).id;

describe('createSeriesSource', () => {
  test('시리즈 편이면 이 편 기준 정보(이전 편 URL 포함)', async () => {
    const source = createSeriesSource({ storage: storageOf(QUEUE), prisma });
    expect(await source.forTopic(await idOf('둘째 편'))).toEqual({
      name: '앱 만들기',
      nameJa: 'アプリ',
      episodeNo: 2,
      total: 2,
      previous: { title: '첫 편', url: 'https://velog.io/@x/first' },
      alreadyPublished: false,
    });
  });

  test('시리즈가 아닌 주제·없는 주제는 undefined', async () => {
    const source = createSeriesSource({ storage: storageOf(QUEUE), prisma });
    expect(await source.forTopic(await idOf('일반 주제'))).toBeUndefined();
    expect(await source.forTopic('nope')).toBeUndefined();
  });

  test('정의 줄이 없으면 SERIES_NOT_DEFINED, 파일을 못 읽으면 SERIES_QUEUE_UNREADABLE(둘 다 재시도 불가)', async () => {
    const id = await idOf('둘째 편');
    const noDef = createSeriesSource({
      storage: storageOf(QUEUE.replace('시리즈 A. 앱 만들기 (ja: アプリ)\n', '')),
      prisma,
    });
    await expect(noDef.forTopic(id)).rejects.toMatchObject({
      code: 'SERIES_NOT_DEFINED',
      retryable: false,
    });

    const broken = createSeriesSource({
      storage: {
        readQueueFile: async () => {
          throw new Error('ENOENT');
        },
        writeQueueFile: async () => {},
      },
      prisma,
    });
    const error = await broken.forTopic(id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StepFailure);
    expect(error).toMatchObject({ code: 'SERIES_QUEUE_UNREADABLE', retryable: false });
  });
});
