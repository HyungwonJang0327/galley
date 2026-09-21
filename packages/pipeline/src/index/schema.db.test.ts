// 리포 인덱스 스키마 통합 테스트: 임시 SQLite에 마이그레이션을 적용하고 제약(unique·cascade·기본값)을 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  ANALYSIS_KIND,
  INDEX_JOB_KIND,
  INDEX_JOB_STATUS,
  LINK_SOURCE,
  REPO_STATUS,
  parseStringArray,
  parsePointers,
  serializePointers,
  serializeStringArray,
} from './schema.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-index-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

beforeEach(async () => {
  await prisma.topicAnalysisLink.deleteMany();
  await prisma.indexJob.deleteMany();
  await prisma.repoAnalysis.deleteMany();
  await prisma.repo.deleteMany();
  await prisma.queueItem.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

const POINTERS = [{ commit: 'abc1234', path: 'src/a.ts', lineStart: 1, lineEnd: 20, note: 'a' }];
const pointersText = (): string => {
  const s = serializePointers(POINTERS);
  if (!s.ok) throw new Error('fixture pointers invalid');
  return s.text;
};

// 픽스처 경로는 임시 폴더에서 파생(접근하지 않는다).
async function makeRepo(name = 'spacehome', path = join(dbDir, 'repo-a')) {
  return prisma.repo.create({
    data: { name, path, aliases: serializeStringArray(['sh', 'space-home']), readOnly: true },
  });
}
async function makeTopic(title = '주제') {
  return prisma.queueItem.create({ data: { title, order: 0 } });
}
async function makeAnalysis(repoId: string, key = 'area:src', kind: string = ANALYSIS_KIND.area) {
  return prisma.repoAnalysis.create({
    data: {
      repoId,
      kind,
      key,
      title: 't',
      summary: 's',
      pointers: pointersText(),
      modelId: 'mock',
    },
  });
}

describe('리포 인덱스 스키마', () => {
  test('Repo 기본값: status=indexing, aliases=[] 파싱, readOnly 저장', async () => {
    const repo = await makeRepo();
    expect(repo.status).toBe(REPO_STATUS.indexing);
    expect(parseStringArray(repo.aliases)).toEqual(['sh', 'space-home']);
    expect(repo.readOnly).toBe(true);
    const plain = await prisma.repo.create({
      data: { name: 'other', path: join(dbDir, 'repo-b') },
    });
    expect(parseStringArray(plain.aliases)).toEqual([]);
    expect(plain.readOnly).toBe(false);
  });

  test('Repo.path·name은 unique', async () => {
    await makeRepo();
    await expect(makeRepo('spacehome', join(dbDir, 'other'))).rejects.toThrow();
    await expect(makeRepo('another', join(dbDir, 'repo-a'))).rejects.toThrow();
  });

  test('RepoAnalysis는 포인터 JSON을 왕복하고 kind·period·summaryOnly를 저장한다', async () => {
    const repo = await makeRepo();
    const analysis = await prisma.repoAnalysis.create({
      data: {
        repoId: repo.id,
        kind: ANALYSIS_KIND.change,
        key: 'change:2024-03',
        title: '2024-03 변경',
        summary: '요약',
        keywords: serializeStringArray(['router', 'cart']),
        pointers: pointersText(),
        period: '2024-03',
        modelId: 'anthropic:claude-haiku-4-5-20251001',
        inputTokens: 1200,
        outputTokens: 300,
        costUsd: 0.0027,
      },
    });
    expect(parsePointers(analysis.pointers)).toEqual(POINTERS);
    expect(parseStringArray(analysis.keywords)).toEqual(['router', 'cart']);
    expect(analysis.summaryOnly).toBe(false);
    expect(analysis.period).toBe('2024-03');
  });

  test('RepoAnalysis.key는 리포 안에서 unique — 증분 재인덱싱이 upsert로 id를 유지하는 근거', async () => {
    const repo = await makeRepo();
    const first = await makeAnalysis(repo.id, 'area:src/router');
    await expect(makeAnalysis(repo.id, 'area:src/router')).rejects.toThrow();
    const other = await makeRepo('other', join(dbDir, 'repo-b'));
    await makeAnalysis(other.id, 'area:src/router'); // 다른 리포는 같은 key 가능
    const upserted = await prisma.repoAnalysis.upsert({
      where: { repoId_key: { repoId: repo.id, key: 'area:src/router' } },
      update: { summary: '갱신' },
      create: {
        repoId: repo.id,
        kind: ANALYSIS_KIND.area,
        key: 'area:src/router',
        title: 't',
        summary: 's',
        pointers: pointersText(),
        modelId: 'mock',
      },
    });
    expect(upserted.id).toBe(first.id);
    expect(upserted.summary).toBe('갱신');
  });

  test('TopicAnalysisLink는 (topicId, analysisId) unique이고 QueueItem.id 키다', async () => {
    const repo = await makeRepo();
    const analysis = await makeAnalysis(repo.id);
    const topic = await makeTopic();
    const link = await prisma.topicAnalysisLink.create({
      data: { topicId: topic.id, analysisId: analysis.id, source: LINK_SOURCE.auto },
    });
    await expect(
      prisma.topicAnalysisLink.create({
        data: { topicId: topic.id, analysisId: analysis.id, source: LINK_SOURCE.manual },
      }),
    ).rejects.toThrow();
    // 없는 주제는 붙일 수 없다(FK)
    await expect(
      prisma.topicAnalysisLink.create({
        data: { topicId: 'nope', analysisId: analysis.id, source: LINK_SOURCE.auto },
      }),
    ).rejects.toThrow();
    // 다른 주제는 같은 분석 글에 붙을 수 있고, auto → manual 승격은 source 갱신(updatedAt이 시각)
    const other = await makeTopic('다른 주제');
    await prisma.topicAnalysisLink.create({
      data: { topicId: other.id, analysisId: analysis.id, source: LINK_SOURCE.manual },
    });
    const promoted = await prisma.topicAnalysisLink.update({
      where: { id: link.id },
      data: { source: LINK_SOURCE.manual },
    });
    expect(promoted.updatedAt.getTime()).toBeGreaterThanOrEqual(link.updatedAt.getTime());
    expect(await prisma.topicAnalysisLink.count({ where: { topicId: topic.id } })).toBe(1);
  });

  test('Repo를 지우면 RepoAnalysis·TopicAnalysisLink·IndexJob이 함께 지워진다(cascade), 주제는 남는다', async () => {
    const repo = await makeRepo();
    const analysis = await makeAnalysis(repo.id, 'overview', ANALYSIS_KIND.overview);
    const topic = await makeTopic();
    await prisma.topicAnalysisLink.create({
      data: { topicId: topic.id, analysisId: analysis.id, source: LINK_SOURCE.auto },
    });
    await prisma.indexJob.create({
      data: { repoId: repo.id, kind: INDEX_JOB_KIND.full, modelId: 'mock' },
    });
    await prisma.repo.delete({ where: { id: repo.id } });
    expect(await prisma.repoAnalysis.count()).toBe(0);
    expect(await prisma.topicAnalysisLink.count()).toBe(0);
    expect(await prisma.indexJob.count()).toBe(0);
    expect(await prisma.queueItem.count()).toBe(1);
  });

  test('IndexJob 기본값: status=queued, 진행 0/0·커서 null, 토큰·비용 null', async () => {
    const repo = await makeRepo();
    const job = await prisma.indexJob.create({
      data: {
        repoId: repo.id,
        kind: INDEX_JOB_KIND.incremental,
        fromSha: 'a',
        toSha: 'b',
        modelId: 'mock',
      },
    });
    expect(job.status).toBe(INDEX_JOB_STATUS.queued);
    expect(job.progressDone).toBe(0);
    expect(job.progressTotal).toBe(0);
    expect(job.progressCursor).toBeNull();
    expect(job.inputTokens).toBeNull();
    expect(job.costUsd).toBeNull();
    expect(job.heartbeat).toBeNull();
  });

  test('QueueItem 힌트 컬럼 기본값: repoNames·keywords는 빈 배열, period는 null — 기존 행도 그대로', async () => {
    const item = await prisma.queueItem.create({ data: { title: '주제', order: 0 } });
    expect(parseStringArray(item.repoNames)).toEqual([]);
    expect(parseStringArray(item.keywords)).toEqual([]);
    expect(item.period).toBeNull();
    const updated = await prisma.queueItem.update({
      where: { id: item.id },
      data: {
        repoNames: serializeStringArray(['spacehome']),
        keywords: serializeStringArray(['react-router']),
        period: '2024.03',
      },
    });
    expect(parseStringArray(updated.repoNames)).toEqual(['spacehome']);
    expect(updated.period).toBe('2024.03');
  });
});
