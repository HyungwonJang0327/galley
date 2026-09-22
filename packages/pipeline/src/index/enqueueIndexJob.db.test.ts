import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { enqueueIndexJob } from './enqueueIndexJob.ts';
import { INDEX_JOB_STATUS, REPO_STATUS, parseStringArray } from './schema.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir: string;
let repoPath: string;
let prisma: PrismaClient;
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t.test',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t.test',
};
const g = (...args: string[]) =>
  execFileSync('git', args, { cwd: repoPath, env: GIT_ENV, encoding: 'utf8' }).trim();

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-enqueue-'));
  repoPath = join(dir, 'my-repo');
  await mkdir(repoPath, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoPath, env: GIT_ENV });
  await writeFile(join(repoPath, 'a.txt'), 'a\n');
  g('add', '.');
  g('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
  const url = `file:${join(dir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});
beforeEach(async () => {
  await prisma.indexJob.deleteMany();
  await prisma.repo.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

describe('enqueueIndexJob', () => {
  test('처음이면 Repo(indexing, 이름=폴더명)와 full 작업을 만든다', async () => {
    const r = await enqueueIndexJob(prisma, {
      path: repoPath,
      modelId: 'm',
      aliases: ['mr', ' mr '],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.repo).toMatchObject({
      name: 'my-repo',
      path: repoPath,
      readOnly: false,
      created: true,
    });
    expect(r.value.job).toMatchObject({ kind: 'full', toSha: g('rev-parse', 'HEAD') });
    expect(r.value.job?.fromSha).toBeUndefined();
    const repo = await prisma.repo.findUniqueOrThrow({ where: { id: r.value.repo.id } });
    expect(repo.status).toBe(REPO_STATUS.indexing);
    expect(parseStringArray(repo.aliases)).toEqual(['mr']);
    const job = await prisma.indexJob.findUniqueOrThrow({ where: { id: r.value.job!.id } });
    expect(job).toMatchObject({ status: INDEX_JOB_STATUS.queued, modelId: 'm', fromSha: null });
  });

  test('활성 작업이 있으면 INDEX_JOB_ACTIVE, 이름이 다른 경로에 쓰이면 REPO_NAME_TAKEN, git 리포가 아니면 NOT_A_GIT_REPO', async () => {
    const first = await enqueueIndexJob(prisma, { path: repoPath, modelId: 'm' });
    const again = await enqueueIndexJob(prisma, { path: repoPath, modelId: 'm' });
    expect(again).toEqual({
      ok: false,
      code: 'INDEX_JOB_ACTIVE',
      jobId: first.ok ? first.value.job!.id : '',
    });
    await prisma.repo.create({ data: { name: 'other', path: join(dir, 'elsewhere') } });
    expect(await enqueueIndexJob(prisma, { path: repoPath, name: 'other', modelId: 'm' })).toEqual({
      ok: false,
      code: 'REPO_NAME_TAKEN',
      path: join(dir, 'elsewhere'),
    });
    expect(await enqueueIndexJob(prisma, { path: dir, modelId: 'm' })).toEqual({
      ok: false,
      code: 'NOT_A_GIT_REPO',
    });
  });

  test('인덱스된 리포는 HEAD가 같으면 작업 없음, 다르면 incremental(fromSha=옛 HEAD, Repo stale), --full은 full', async () => {
    const head1 = g('rev-parse', 'HEAD');
    const repo = await prisma.repo.create({
      data: { name: 'my-repo', path: repoPath, headSha: head1, status: REPO_STATUS.ready },
    });
    const same = await enqueueIndexJob(prisma, { path: repoPath, modelId: 'm' });
    expect(same.ok && same.value.job).toBeUndefined();
    expect(same.ok && same.value.repo.created).toBe(false);

    await writeFile(join(repoPath, 'b.txt'), 'b\n');
    g('add', '.');
    g('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'b');
    const head2 = g('rev-parse', 'HEAD');
    const inc = await enqueueIndexJob(prisma, { path: repoPath, modelId: 'm', readOnly: true });
    expect(inc.ok && inc.value.job).toEqual(
      expect.objectContaining({ kind: 'incremental', fromSha: head1, toSha: head2 }),
    );
    const updated = await prisma.repo.findUniqueOrThrow({ where: { id: repo.id } });
    expect(updated).toMatchObject({ status: REPO_STATUS.stale, readOnly: true, name: 'my-repo' });

    await prisma.indexJob.deleteMany();
    const full = await enqueueIndexJob(prisma, { path: repoPath, modelId: 'm', full: true });
    expect(full.ok && full.value.job).toEqual(
      expect.objectContaining({ kind: 'full', toSha: head2 }),
    );
    expect(full.ok && full.value.job?.fromSha).toBeUndefined();

    // 마지막 작업이 실패한(error) 리포는 --full 없이도 전체 다시
    await prisma.indexJob.deleteMany();
    await prisma.repo.update({
      where: { id: repo.id },
      data: { status: REPO_STATUS.error, headSha: head1 },
    });
    const afterError = await enqueueIndexJob(prisma, { path: repoPath, modelId: 'm' });
    expect(afterError.ok && afterError.value.job?.kind).toBe('full');
  });
});
