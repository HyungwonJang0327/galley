// 통합: 임시 SQLite. 리포·분석 글·주제를 직접 심고 auto 연결 동기화·틱 선택·manual 보존을 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  findStaleTopics,
  linkTopicAuto,
  loadAnalysisCandidates,
  runAutoLinkTick,
} from './autoLink.ts';
import { AUTO_LINK_LIMITS, type AutoLinkLimits } from './limits.ts';
import { LINK_SOURCE, serializeStringArray } from '../index/schema.ts';
import { importQueueFromFile } from '../queue/importQueue.ts';
import type { Storage } from '../storage/Storage.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-autolink-'));
  const url = `file:${join(dir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});
beforeEach(async () => {
  await prisma.topicAnalysisLink.deleteMany();
  await prisma.repoAnalysis.deleteMany();
  await prisma.repo.deleteMany();
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

const T0 = new Date('2026-09-22T00:00:00Z');
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const deps = (now: Date, limits: AutoLinkLimits = AUTO_LINK_LIMITS) => ({
  prisma,
  clock: { now: () => now },
  logger: { info: () => {}, error: () => {} },
  limits,
});

async function seedRepo(name: string, lastIndexedAt: Date | null = at(0)) {
  return prisma.repo.create({
    data: { name, path: join(dir, name), lastIndexedAt, status: 'ready' },
  });
}
async function seedAnalysis(
  repoId: string,
  key: string,
  kind: 'overview' | 'area' | 'change',
  keywords: string[],
  period: string | null = null,
) {
  return prisma.repoAnalysis.create({
    data: {
      repoId,
      kind,
      key,
      title: key,
      summary: 's',
      keywords: serializeStringArray(keywords),
      pointers: JSON.stringify([{ commit: 'abc1234', path: 'x' }]),
      period,
      modelId: 'mock',
    },
  });
}
async function seedTopic(
  title: string,
  hints: { repoNames?: string[]; keywords?: string[]; period?: string | null } = {},
) {
  return prisma.queueItem.create({
    data: {
      title,
      status: '대기',
      order: 0,
      repoNames: serializeStringArray(hints.repoNames ?? []),
      keywords: serializeStringArray(hints.keywords ?? []),
      period: hints.period ?? null,
    },
  });
}
const linksOf = async (topicId: string) =>
  (
    await prisma.topicAnalysisLink.findMany({ where: { topicId }, orderBy: { analysisId: 'asc' } })
  ).map((l) => `${l.analysisId}:${l.source}`);

describe('linkTopicAuto', () => {
  test('힌트에 맞는 글만 auto로 붙이고, 힌트가 바뀌면 옛 auto는 지우며, manual은 손대지 않는다', async () => {
    const sh = await seedRepo('spacehome');
    const vm = await seedRepo('vendor-manager');
    const area = await seedAnalysis(sh.id, 'area:src', 'area', ['react-router', 'scroll']);
    const chg3 = await seedAnalysis(sh.id, 'change:2024-03', 'change', ['react-router'], '2024-03');
    const chg7 = await seedAnalysis(sh.id, 'change:2024-07', 'change', ['cart'], '2024-07');
    const vmOv = await seedAnalysis(vm.id, 'overview', 'overview', ['vendor']);
    const topic = await seedTopic('무한 스크롤 (spacehome, react-router, 2024.03)', {
      repoNames: ['spacehome'],
      keywords: ['react-router'],
      period: '2024-03',
    });
    // 사람이 미리 manual로 붙여 둔 것 하나(계산 결과에도 있는 글)와 계산 밖의 글 하나
    await prisma.topicAnalysisLink.createMany({
      data: [
        { topicId: topic.id, analysisId: chg3.id, source: LINK_SOURCE.manual },
        { topicId: topic.id, analysisId: vmOv.id, source: LINK_SOURCE.manual },
      ],
    });

    const candidates = await loadAnalysisCandidates(prisma);
    const r = await linkTopicAuto(prisma, topic.id, candidates, at(1));
    expect(r).toEqual({ topicId: topic.id, linked: 1, added: 1, removed: 0, keptManual: 1 });
    expect(await linksOf(topic.id)).toEqual(
      [`${area.id}:auto`, `${chg3.id}:manual`, `${vmOv.id}:manual`].sort(),
    );
    const row = await prisma.queueItem.findUniqueOrThrow({ where: { id: topic.id } });
    expect(row.autoLinkedAt?.getTime()).toBe(at(1).getTime());
    expect(row.updatedAt.getTime()).toBe(at(1).getTime());

    // 힌트를 7월·cart로 바꾸면 area는 떨어지고 chg7이 붙는다, manual 둘은 그대로
    await prisma.queueItem.update({
      where: { id: topic.id },
      data: { keywords: serializeStringArray(['cart']), period: '2024-07' },
    });
    const r2 = await linkTopicAuto(prisma, topic.id, candidates, at(2));
    expect(r2).toMatchObject({ linked: 1, added: 1, removed: 1, keptManual: 0 });
    expect(await linksOf(topic.id)).toEqual(
      [`${chg7.id}:auto`, `${chg3.id}:manual`, `${vmOv.id}:manual`].sort(),
    );

    // 힌트를 다 지우면 auto는 전부 사라진다
    await prisma.queueItem.update({
      where: { id: topic.id },
      data: { repoNames: '[]', keywords: '[]', period: null },
    });
    await linkTopicAuto(prisma, topic.id, candidates, at(3));
    expect(await linksOf(topic.id)).toEqual([`${chg3.id}:manual`, `${vmOv.id}:manual`].sort());
    expect(await linkTopicAuto(prisma, 'nope', candidates, at(3))).toBeNull();
  });

  test('재적재(힌트 그대로)해도 manual·auto 연결이 유지되고, 힌트를 고치면 다음 계산이 auto만 바꾼다', async () => {
    const sh = await seedRepo('spacehome');
    const area = await seedAnalysis(sh.id, 'area:src', 'area', ['react-router']);
    const ov = await seedAnalysis(sh.id, 'overview', 'overview', ['commerce']);
    const storage = (content: string): Storage => ({
      readQueueFile: async () => content,
      writeQueueFile: async () => {},
    });
    const file = (title: string) => `## 대기\n\n- ${title}\n\n## 후보\n\n## 보류\n\n## 완료\n`;
    await importQueueFromFile({
      storage: storage(file('무한 스크롤 (spacehome, react-router)')),
      prisma,
    });
    const topic = await prisma.queueItem.findFirstOrThrow();
    await prisma.topicAnalysisLink.create({
      data: { topicId: topic.id, analysisId: ov.id, source: LINK_SOURCE.manual },
    });
    const candidates = await loadAnalysisCandidates(prisma);
    await linkTopicAuto(prisma, topic.id, candidates, at(1));
    expect(await linksOf(topic.id)).toEqual([`${area.id}:auto`, `${ov.id}:manual`].sort());

    await importQueueFromFile({
      storage: storage(file('무한 스크롤 (spacehome, react-router)')),
      prisma,
    });
    expect((await prisma.queueItem.findFirstOrThrow()).id).toBe(topic.id);
    expect(await linksOf(topic.id)).toEqual([`${area.id}:auto`, `${ov.id}:manual`].sort());

    await importQueueFromFile({
      storage: storage(file('무한 스크롤 (spacehome, commerce)')),
      prisma,
    });
    await linkTopicAuto(prisma, topic.id, await loadAnalysisCandidates(prisma), at(2));
    // commerce는 overview에 맞지만 이미 manual → auto를 만들지 않는다, area auto는 떨어진다
    expect(await linksOf(topic.id)).toEqual([`${ov.id}:manual`]);
  });
});

describe('findStaleTopics · runAutoLinkTick', () => {
  test('autoLinkedAt이 없거나 힌트 재적재·리포 재인덱싱보다 오래된 주제만, 오래된 순으로 상한까지', async () => {
    const repo = await seedRepo('r', at(0));
    await seedAnalysis(repo.id, 'area:src', 'area', ['react-router']);
    const a = await seedTopic('A (react-router)', { keywords: ['react-router'] });
    const b = await seedTopic('B', {});
    const c = await seedTopic('C (react-router)', { keywords: ['react-router'] });
    expect((await findStaleTopics(prisma, 10)).sort()).toEqual([a.id, b.id, c.id].sort());

    const one = await runAutoLinkTick(deps(at(5), { ...AUTO_LINK_LIMITS, topicsPerTick: 2 }));
    expect(one).toMatchObject({ outcome: 'linked', topics: 2 });
    expect((await findStaleTopics(prisma, 10)).length).toBe(1);
    expect(await runAutoLinkTick(deps(at(6)))).toMatchObject({
      outcome: 'linked',
      topics: 1,
      added: expect.any(Number),
    });
    expect(await runAutoLinkTick(deps(at(7)))).toEqual({ outcome: 'idle' });
    expect(await linksOf(a.id)).toHaveLength(1);
    expect(await linksOf(b.id)).toHaveLength(0);

    // 힌트 재적재(updatedAt 갱신) → 그 주제만 다시
    await prisma.queueItem.update({
      where: { id: b.id },
      data: { keywords: serializeStringArray(['react-router']) },
    });
    expect(await findStaleTopics(prisma, 10)).toEqual([b.id]);
    expect(await runAutoLinkTick(deps(at(10)))).toEqual({
      outcome: 'linked',
      topics: 1,
      added: 1,
      removed: 0,
    });

    // 리포 재인덱싱(lastIndexedAt 갱신) → 전부 다시
    await prisma.repo.update({ where: { id: repo.id }, data: { lastIndexedAt: at(20) } });
    expect((await findStaleTopics(prisma, 10)).length).toBe(3);
    expect(await runAutoLinkTick(deps(at(21)))).toMatchObject({
      outcome: 'linked',
      topics: 3,
      added: 0,
      removed: 0,
    });
    expect(await runAutoLinkTick(deps(at(22)))).toEqual({ outcome: 'idle' });
  });

  test('종료 신호가 오면 주제 사이에서 멈추고, 처음부터 abort면 idle', async () => {
    await seedTopic('A', {});
    await seedTopic('B', {});
    const controller = new AbortController();
    const d = deps(at(1));
    const abortingLogger = {
      info: () => {},
      error: () => {},
    };
    // 첫 주제를 처리한 뒤 신호를 보내기 위해 clock.now 호출을 훅으로 쓴다
    let calls = 0;
    const r = await runAutoLinkTick(
      {
        ...d,
        logger: abortingLogger,
        clock: {
          now: () => {
            calls += 1;
            if (calls === 1) controller.abort();
            return at(1);
          },
        },
      },
      controller.signal,
    );
    expect(r).toMatchObject({ outcome: 'linked', topics: 1 });
    expect(await findStaleTopics(prisma, 10)).toHaveLength(1);
    expect(await runAutoLinkTick(d, controller.signal)).toEqual({ outcome: 'idle' });
  });
});
