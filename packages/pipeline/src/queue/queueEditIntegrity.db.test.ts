// A6d 편집→파일 반영 무결성: 여러 편집을 연달아 해도 주제_큐.md와 DB가 어긋나지 않는다.
// 단일 편집의 파일·DB 반영은 moveQueue.db/reorderQueue.db 테스트가 덮는다 — 여기서는 누적을 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { importQueueFromFile } from './importQueue';
import { moveQueueTopic } from './moveQueue';
import { parseQueue, serializeQueue, type QueueStatus } from './queueFile';
import { reorderQueueTopic } from './reorderQueue';
import type { Storage } from '../storage/Storage';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const STATUSES: QueueStatus[] = ['대기', '후보', '보류', '완료'];

const SAMPLE = `# 블로그 주제 큐

안내 문장(서문).

## 대기

- 대기 A
- 대기 B

## 후보

- 무카테고리 후보

### 프론트
- 프론트 후보

## 보류

- 보류 하나

## 완료

- 2026-09-06 완료 하나
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
let storage: ReturnType<typeof memoryStorage>;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-integrity-db-'));
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
  storage = memoryStorage(SAMPLE);
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

/** 파일을 파싱한 결과와 DB 행이 완전히 같은지(섹션·순서·제목·카테고리·완료일). */
async function expectFileAndDbInSync() {
  const parsed = parseQueue(storage.content);
  const fromFile = STATUSES.flatMap((status) =>
    parsed.sections[status].map((topic, order) => ({
      title: topic.title,
      status,
      order,
      category: topic.category ?? null,
      completedOn: topic.completedOn ?? null,
    })),
  );
  const rows = await prisma.queueItem.findMany();
  const fromDb = rows.map((row) => ({
    title: row.title,
    status: row.status,
    order: row.order,
    category: row.category,
    completedOn: row.completedOn,
  }));

  const key = (item: { status: string; order: number }) => `${item.status}#${item.order}`;
  const sorted = <T extends { status: string; order: number }>(items: T[]) =>
    [...items].sort((a, b) => key(a).localeCompare(key(b)));

  expect(sorted(fromDb)).toEqual(sorted(fromFile));
}

const titles = (status: QueueStatus) =>
  parseQueue(storage.content).sections[status].map((t) => t.title);

describe('큐 편집 무결성(연속 편집)', () => {
  test('이동·순서 변경을 번갈아 해도 매 단계 파일과 DB가 같다', async () => {
    await importQueueFromFile({ storage, prisma });
    await expectFileAndDbInSync();

    // 1) 보류 → 대기(맨 아래)
    expect(
      await moveQueueTopic(
        { storage, prisma },
        { from: '보류', to: '대기', index: 0, title: '보류 하나' },
      ),
    ).toEqual({ ok: true });
    expect(titles('대기')).toEqual(['대기 A', '대기 B', '보류 하나']);
    await expectFileAndDbInSync();

    // 2) 방금 옮긴 항목을 대기 맨 위로
    expect(
      await reorderQueueTopic(
        { storage, prisma },
        { status: '대기', from: 2, to: 0, title: '보류 하나' },
      ),
    ).toEqual({ ok: true });
    expect(titles('대기')).toEqual(['보류 하나', '대기 A', '대기 B']);
    await expectFileAndDbInSync();

    // 3) 대기 → 보류
    expect(
      await moveQueueTopic(
        { storage, prisma },
        { from: '대기', to: '보류', index: 1, title: '대기 A' },
      ),
    ).toEqual({ ok: true });
    expect(titles('대기')).toEqual(['보류 하나', '대기 B']);
    expect(titles('보류')).toEqual(['대기 A']);
    await expectFileAndDbInSync();

    // 4) 후보(카테고리 있는 항목) → 대기: 카테고리를 잃고 맨 아래
    expect(
      await moveQueueTopic(
        { storage, prisma },
        { from: '후보', to: '대기', index: 1, title: '프론트 후보' },
      ),
    ).toEqual({ ok: true });
    expect(titles('대기')).toEqual(['보류 하나', '대기 B', '프론트 후보']);
    await expectFileAndDbInSync();
  });

  test('편집을 거듭해도 서문·완료일·남은 카테고리가 보존된다', async () => {
    await importQueueFromFile({ storage, prisma });

    await moveQueueTopic(
      { storage, prisma },
      { from: '보류', to: '대기', index: 0, title: '보류 하나' },
    );
    await reorderQueueTopic(
      { storage, prisma },
      { status: '대기', from: 2, to: 0, title: '보류 하나' },
    );
    await moveQueueTopic(
      { storage, prisma },
      { from: '대기', to: '후보', index: 1, title: '대기 A' },
    );

    const parsed = parseQueue(storage.content);
    expect(parsed.preamble).toContain('안내 문장(서문)');
    expect(parsed.sections.완료).toEqual([{ title: '완료 하나', completedOn: '2026-09-06' }]);
    expect(parsed.sections.후보).toEqual([
      { title: '무카테고리 후보' },
      { title: '대기 A' },
      { title: '프론트 후보', category: '프론트' },
    ]);
    await expectFileAndDbInSync();
  });

  test('편집을 거듭해도 표기가 밀리지 않는다(재직렬화가 동일)', async () => {
    await importQueueFromFile({ storage, prisma });

    await moveQueueTopic(
      { storage, prisma },
      { from: '보류', to: '대기', index: 0, title: '보류 하나' },
    );
    await reorderQueueTopic(
      { storage, prisma },
      { status: '대기', from: 0, to: 2, title: '대기 A' },
    );
    await moveQueueTopic(
      { storage, prisma },
      { from: '대기', to: '보류', index: 0, title: '대기 B' },
    );

    expect(serializeQueue(parseQueue(storage.content))).toBe(storage.content);
  });

  test('중간에 파일이 밖에서 바뀌면 그 편집만 거부되고, 다시 적재하면 파일과 DB가 같아진다', async () => {
    await importQueueFromFile({ storage, prisma });

    // 스케줄·편집기가 파일을 먼저 고친 상황(대기 맨 위가 바뀜) — DB는 아직 옛 상태.
    storage.content = storage.content.replace('- 대기 A\n', '- 밖에서 추가\n- 대기 A\n');

    // 옛 위치·제목으로 보낸 편집은 거부된다.
    expect(
      await moveQueueTopic(
        { storage, prisma },
        { from: '대기', to: '보류', index: 0, title: '대기 A' },
      ),
    ).toEqual({ ok: false, code: 'TOPIC_MISMATCH' });
    expect(titles('대기')).toEqual(['밖에서 추가', '대기 A', '대기 B']);

    // 다시 적재하면(화면 로드·갱신 버튼) 파일 기준으로 맞춰진다.
    await importQueueFromFile({ storage, prisma });
    await expectFileAndDbInSync();

    // 그 뒤 편집은 새 위치 기준으로 정상 동작한다.
    expect(
      await reorderQueueTopic(
        { storage, prisma },
        { status: '대기', from: 0, to: 2, title: '밖에서 추가' },
      ),
    ).toEqual({ ok: true });
    expect(titles('대기')).toEqual(['대기 A', '대기 B', '밖에서 추가']);
    await expectFileAndDbInSync();
  });
});
