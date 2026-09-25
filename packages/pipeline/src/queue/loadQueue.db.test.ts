// loadQueueSections 통합 테스트: 실제 임시 SQLite로 "파일 재적재 → 섹션별 읽기"를 검증한다.
// tmpdir에 DB 파일을 만들고 migrate deploy로 스키마를 세운 뒤 실제 PrismaClient를 쓴다.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadQueueSections } from './loadQueue.ts';
import { countTopicsByStatus } from './queueCounts.ts';
import type { Storage } from '../storage/Storage.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

function fakeStorage(content: string): Storage {
  return {
    readQueueFile: async () => content,
    writeQueueFile: async () => {},
  };
}

const QUEUE_FILE = [
  '## 대기',
  '',
  '- 대기1',
  '- [A-2] 대기2',
  '',
  '## 후보',
  '',
  '### 프론트',
  '',
  '- 후보1',
  '',
  '### 시리즈',
  '',
  '시리즈 A. 앱 만들기',
  '- [A-3] (기존 글) 후보 편',
  '',
  '## 보류',
  '',
  '- 보류1',
  '',
  '## 완료',
  '',
  '- 2026-09-01 완료1',
  '',
].join('\n');

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-load-queue-'));
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

describe('loadQueueSections', () => {
  test('섹션별로 파일 순서대로, 표시 필드와 함께 돌려준다', async () => {
    const sections = await loadQueueSections({ storage: fakeStorage(QUEUE_FILE), prisma });

    const id = expect.any(String) as unknown as string;
    expect(sections).toEqual({
      대기: [
        { id, title: '대기1', category: null, completedOn: null, series: null },
        {
          id,
          title: '대기2',
          category: null,
          completedOn: null,
          series: { key: 'A', episode: 2, alreadyPublished: false },
        },
      ],
      후보: [
        { id, title: '후보1', category: '프론트', completedOn: null, series: null },
        {
          id,
          title: '(기존 글) 후보 편',
          category: '시리즈',
          completedOn: null,
          series: { key: 'A', episode: 3, alreadyPublished: true },
        },
      ],
      보류: [{ id, title: '보류1', category: null, completedOn: null, series: null }],
      완료: [{ id, title: '완료1', category: null, completedOn: '2026-09-01', series: null }],
    });
    // id는 QueueItem.id — 실행 시작·상세 연결 키. 적재된 행과 같아야 한다.
    const row = await prisma.queueItem.findFirstOrThrow({ where: { title: '대기1' } });
    expect(sections.대기[0]?.id).toBe(row.id);
  });

  test('로드할 때마다 파일을 다시 읽는다(파일이 진실)', async () => {
    await loadQueueSections({ storage: fakeStorage(QUEUE_FILE), prisma });
    const next = await loadQueueSections({
      storage: fakeStorage('## 대기\n\n- 새글\n\n## 후보\n\n## 보류\n\n## 완료\n'),
      prisma,
    });

    expect(next.대기.map((topic) => topic.title)).toEqual(['새글']);
    expect(next.후보).toEqual([]);
    expect(next.완료).toEqual([]);
  });
});

describe('countTopicsByStatus', () => {
  test('적재하지 않고 DB만 센다(셸 배지가 쓰는 경로)', async () => {
    await loadQueueSections({ storage: fakeStorage(QUEUE_FILE), prisma });

    // 파일이 바뀌어도 다시 적재하기 전까지는 마지막 적재 기준이다.
    expect(await countTopicsByStatus(prisma, '대기')).toBe(2);
    expect(await countTopicsByStatus(prisma, '후보')).toBe(2);
    expect(await countTopicsByStatus(prisma, '완료')).toBe(1);
  });
});
