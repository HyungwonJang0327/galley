// 통합: 임시 SQLite. 배경 메모의 읽기·쓰기와 "재적재가 메모를 지우지 않는다"를 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { importQueueFromFile } from './importQueue.ts';
import { TOPIC_NOTE_MAX_CHARS, getTopicNote, setTopicNote } from './topicNote.ts';
import type { Storage } from '../storage/Storage.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-topicnote-'));
  const url = `file:${join(dir, 'test.db')}`;
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
  await rm(dir, { recursive: true, force: true });
});

const topic = () =>
  prisma.queueItem.create({ data: { title: '무한 스크롤', status: 'waiting', order: 0 } });

describe('배경 메모', () => {
  test('없는 주제는 값으로 거부한다', async () => {
    expect(await getTopicNote(prisma, 'nope')).toEqual({ ok: false, code: 'TOPIC_NOT_FOUND' });
    expect(await setTopicNote(prisma, { topicId: 'nope', note: 'x' })).toEqual({
      ok: false,
      code: 'TOPIC_NOT_FOUND',
    });
  });

  test('처음에는 빈 문자열이고, 저장하면 앞뒤 공백을 떼고 줄바꿈을 맞춘 값이 읽힌다', async () => {
    const t = await topic();
    expect(await getTopicNote(prisma, t.id)).toEqual({ ok: true, note: '' });
    const saved = await setTopicNote(prisma, {
      topicId: t.id,
      note: '  회사에서 2년 넘게 만든 제품\r\n사용자는 나 혼자\n\n',
    });
    expect(saved).toEqual({ ok: true, note: '회사에서 2년 넘게 만든 제품\n사용자는 나 혼자' });
    expect(await getTopicNote(prisma, t.id)).toEqual({
      ok: true,
      note: '회사에서 2년 넘게 만든 제품\n사용자는 나 혼자',
    });
  });

  test('빈 값으로 저장하면 지운다(null)', async () => {
    const t = await topic();
    await setTopicNote(prisma, { topicId: t.id, note: '메모' });
    expect(await setTopicNote(prisma, { topicId: t.id, note: '  \n ' })).toEqual({
      ok: true,
      note: '',
    });
    const row = await prisma.queueItem.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.backgroundNote).toBeNull();
  });

  test('상한을 넘으면 거부하고 저장하지 않는다', async () => {
    const t = await topic();
    expect(
      await setTopicNote(prisma, { topicId: t.id, note: '가'.repeat(TOPIC_NOTE_MAX_CHARS + 1) }),
    ).toEqual({ ok: false, code: 'TOPIC_NOTE_TOO_LONG' });
    expect(
      await setTopicNote(prisma, { topicId: t.id, note: '가'.repeat(TOPIC_NOTE_MAX_CHARS) }),
    ).toMatchObject({ ok: true });
  });

  test('같은 값을 다시 저장하면 행을 쓰지 않는다(updatedAt 유지)', async () => {
    const t = await topic();
    await setTopicNote(prisma, { topicId: t.id, note: '메모' });
    const before = await prisma.queueItem.findUniqueOrThrow({ where: { id: t.id } });
    await new Promise((r) => setTimeout(r, 15));
    await setTopicNote(prisma, { topicId: t.id, note: '메모\n' });
    const after = await prisma.queueItem.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  test('파일에서 다시 불러와도 메모는 남는다', async () => {
    const storage: Storage = {
      readQueueFile: async () => '## 대기\n\n- 무한 스크롤\n\n## 후보\n\n## 보류\n\n## 완료\n',
      writeQueueFile: async () => {},
    };
    await importQueueFromFile({ storage, prisma });
    const row = await prisma.queueItem.findFirstOrThrow({ where: { title: '무한 스크롤' } });
    await setTopicNote(prisma, { topicId: row.id, note: '사용자는 나 혼자' });
    await importQueueFromFile({ storage, prisma });
    expect(await getTopicNote(prisma, row.id)).toEqual({ ok: true, note: '사용자는 나 혼자' });
  });
});
