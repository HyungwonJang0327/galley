// 통합: tmpdir 픽스처 git 리포 + 임시 SQLite + 스크립트 어댑터. 회사 리포는 열지 않는다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { indexRepoAreas, type AreaProgress } from './indexRepoAreas.ts';
import { upsertRepoAnalysis } from './repoAnalysisRepo.ts';
import { gitShowFile } from './gitRead.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { parsePointers, parseStringArray, REPO_STATUS } from './schema.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import type { AreaAnalysisDraft } from './areaAnalysis.ts';

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

const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};

/** 프롬프트에서 디렉터리와 본문이 있는 첫 파일을 뽑아 답한다(포인터는 lineEnd를 크게 줘 clamp를 유도). */
const answerFromPrompt = (prompt: string) => {
  const dirName = /디렉터리: (.+)/.exec(prompt)![1]!;
  const file = /### (\S+)/.exec(prompt)?.[1];
  return JSON.stringify({
    title: `${dirName} 영역 (Example Corp)`,
    summary: `${dirName}의 역할 요약.`,
    keywords: [dirName, 'fixture', 'Example Corp'],
    pointers: file ? [{ path: file, lineStart: 1, lineEnd: 999, note: 'entry' }] : [],
  });
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-indexer-'));
  repoPath = join(dir, 'repo');
  await mkdir(join(repoPath, 'src'), { recursive: true });
  await mkdir(join(repoPath, 'docs'), { recursive: true });
  await mkdir(join(repoPath, 'node_modules', 'x'), { recursive: true });
  await writeFile(join(repoPath, 'README.md'), '# fixture\n');
  await writeFile(join(repoPath, 'src', 'a.ts'), 'export const a = 1;\nexport const b = 2;\n');
  await writeFile(join(repoPath, 'docs', 'guide.md'), 'guide\n');
  await writeFile(join(repoPath, '.env'), 'SECRET=should-never-reach-the-model\n');
  await writeFile(join(repoPath, 'node_modules', 'x', 'index.js'), 'ignored\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoPath, env: GIT_ENV });
  g('add', '-f', '.');
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
  await prisma.topicAnalysisLink.deleteMany();
  await prisma.repoAnalysis.deleteMany();
  await prisma.repo.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

async function makeRepo(readOnly: boolean) {
  return prisma.repo.create({ data: { name: 'fixture', path: repoPath, readOnly } });
}
const inputFor = (repo: { id: string }, readOnly: boolean) => ({
  id: repo.id,
  name: 'fixture',
  path: repoPath,
  readOnly,
});

describe('indexRepoAreas', () => {
  test('영역마다 분석 글을 저장하고(비밀값·node_modules 제외, redact 적용, 포인터 clamp) Repo 상태는 건드리지 않는다', async () => {
    const repo = await makeRepo(true);
    const adapter = createScriptedAdapter((input) => answerFromPrompt(input.prompt));
    const progress: AreaProgress[] = [];
    const before = g('status', '--porcelain');
    const r = await indexRepoAreas(prisma, {
      repo: inputFor(repo, true),
      adapter,
      redactConfig: REDACT,
      onAreaDone: (p) => {
        progress.push(p);
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({
      totalFiles: 5,
      ignoredFiles: 2,
      planned: 3,
      saved: 3,
      skipped: 0,
      resumedPast: 0,
      unchanged: 0,
      remaining: 0,
      unreadableFiles: 0,
    });
    expect(r.report.usage.inputTokens).toBeGreaterThan(0);
    expect(JSON.stringify(r.report)).not.toMatch(/src|docs|README/); // report에는 경로·디렉터리명이 없다
    expect(progress.map((p) => `${p.key}:${p.status}:${p.done}/${p.total}`)).toEqual([
      'area:.:saved:1/3',
      'area:docs:saved:2/3',
      'area:src:saved:3/3',
    ]);
    expect(progress.every((p) => p.analysisId !== undefined && p.usage.inputTokens > 0)).toBe(true);
    // 프롬프트에 .env 내용이 들어가지 않았다
    expect(adapter.calls.some((c) => c.prompt.includes('should-never-reach'))).toBe(false);

    const rows = await prisma.repoAnalysis.findMany({
      where: { repoId: repo.id },
      orderBy: { key: 'asc' },
    });
    expect(rows.map((x) => x.key)).toEqual(['area:.', 'area:docs', 'area:src']);
    const src = rows.find((x) => x.key === 'area:src')!;
    expect(src.title).toBe('src 영역 ([COMPANY])');
    expect(src.filtered).toBe(true);
    expect(src.redacted).toBe(true);
    expect(parseStringArray(src.keywords)).toEqual(['src', 'fixture', '[company]']);
    expect(parsePointers(src.pointers)).toEqual([
      { commit: r.report.headSha, path: 'src/a.ts', lineStart: 1, lineEnd: 2, note: 'entry' },
    ]);

    // 완료 조건: 저장된 모든 포인터가 실제 파일·라인을 가리킨다
    for (const row of rows) {
      for (const p of parsePointers(row.pointers)) {
        const shown = await gitShowFile(repoPath, p.commit, p.path);
        expect(shown.ok, `${row.key} → ${p.path}`).toBe(true);
        if (!shown.ok) continue;
        const lines = shown.value.replace(/\n$/, '').split('\n').length;
        if (p.lineEnd !== undefined) expect(p.lineEnd).toBeLessThanOrEqual(lines);
      }
    }
    // Repo 상태·headSha는 이 함수가 쓰지 않는다(IndexJob 실행자 몫)
    const untouched = await prisma.repo.findUniqueOrThrow({ where: { id: repo.id } });
    expect(untouched.status).toBe(REPO_STATUS.indexing);
    expect(untouched.headSha).toBeNull();
    // 리포는 읽기만 했다
    expect(g('status', '--porcelain')).toBe(before);
    expect(g('rev-parse', 'HEAD')).toBe(r.report.headSha);
  });

  test('readOnly 리포에 redact 설정이 없으면 REDACT_CONFIG_REQUIRED — 아무것도 저장하지 않는다', async () => {
    const repo = await makeRepo(true);
    const adapter = createScriptedAdapter((input) => answerFromPrompt(input.prompt));
    expect(
      await indexRepoAreas(prisma, { repo: inputFor(repo, true), adapter, redactConfig: null }),
    ).toEqual({ ok: false, code: 'REDACT_CONFIG_REQUIRED' });
    expect(adapter.calls).toHaveLength(0);
    expect(await prisma.repoAnalysis.count()).toBe(0);
  });

  test('readOnly가 아니면 설정 없이 진행하고 filtered=false로 저장한다', async () => {
    const repo = await makeRepo(false);
    const r = await indexRepoAreas(prisma, {
      repo: inputFor(repo, false),
      adapter: createScriptedAdapter((i) => answerFromPrompt(i.prompt)),
      redactConfig: null,
    });
    expect(r.ok).toBe(true);
    const row = await prisma.repoAnalysis.findFirst({
      where: { repoId: repo.id, key: 'area:src' },
    });
    expect(row!.filtered).toBe(false);
    expect(row!.title).toContain('Example Corp');
  });

  test('출력이 깨진 영역은 건너뛰고(skipped, 과금은 합산) 나머지는 저장한다', async () => {
    const repo = await makeRepo(false);
    const adapter = createScriptedAdapter((input) =>
      input.prompt.includes('디렉터리: docs') ? '못 알아듣겠어요' : answerFromPrompt(input.prompt),
    );
    const progress: AreaProgress[] = [];
    const r = await indexRepoAreas(prisma, {
      repo: inputFor(repo, false),
      adapter,
      redactConfig: null,
      onAreaDone: (p) => void progress.push(p),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.skipped).toBe(1);
    expect(JSON.stringify(r.report)).not.toMatch(/docs/); // skipped가 있어도 report에 경로가 없다
    expect(r.report.saved).toBe(2);
    const skippedProgress = progress.find((p) => p.key === 'area:docs')!;
    expect(skippedProgress.status).toBe('skipped');
    expect(skippedProgress.analysisId).toBeUndefined();
    expect(r.report.usage.inputTokens).toBe(progress.reduce((s, p) => s + p.usage.inputTokens, 0));
  });

  test('모델 호출 실패(MODEL_FAILED)는 중단하고 실패 값 + 지금까지의 partial report를 돌려준다', async () => {
    const repo = await makeRepo(false);
    const adapter = createScriptedAdapter((input, i) => {
      if (i === 1) throw new Error('401 invalid api key');
      return answerFromPrompt(input.prompt);
    });
    const r = await indexRepoAreas(prisma, {
      repo: inputFor(repo, false),
      adapter,
      redactConfig: null,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('MODEL_FAILED');
    if (r.code !== 'MODEL_FAILED') return;
    expect(r.errorName).toBe('Error');
    expect(r.partial.saved).toBe(1);
    expect(await prisma.repoAnalysis.count()).toBe(1);
  });

  test('skipKeys로 재개하면 그 영역은 모델을 부르지 않고 resumedPast로 센다', async () => {
    const repo = await makeRepo(false);
    const adapter = createScriptedAdapter((input) => answerFromPrompt(input.prompt));
    const r = await indexRepoAreas(prisma, {
      repo: inputFor(repo, false),
      adapter,
      redactConfig: null,
      skipKeys: ['area:.', 'area:docs'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({ planned: 3, saved: 1, resumedPast: 2 });
    expect(adapter.calls).toHaveLength(1);
    expect(r.plannedKeys).toEqual(['area:.', 'area:docs', 'area:src']);
  });

  test('resumeAfterKey·maxBatches로 틱마다 영역 하나씩 돌리고, changedPaths가 있으면 그 영역만', async () => {
    const repo = await makeRepo(false);
    const adapter = createScriptedAdapter((input) => answerFromPrompt(input.prompt));
    const first = await indexRepoAreas(prisma, {
      repo: inputFor(repo, false),
      adapter,
      redactConfig: null,
      resumeAfterKey: 'area:.',
      maxBatches: 1,
    });
    expect(first.ok && first.report).toMatchObject({
      planned: 3,
      saved: 1,
      resumedPast: 1,
      remaining: 1,
    });
    expect(adapter.calls.at(-1)!.prompt).toContain('디렉터리: docs');

    const inc = await indexRepoAreas(prisma, {
      repo: inputFor(repo, false),
      adapter,
      redactConfig: null,
      changedPaths: ['src/a.ts', 'gone/x.ts', 'node_modules/x/index.js'],
    });
    expect(inc.ok && inc.report).toMatchObject({
      planned: 3,
      saved: 1,
      unchanged: 2,
      remaining: 0,
    });
    expect(adapter.calls.at(-1)!.prompt).toContain('디렉터리: src');
  });

  test('다시 인덱싱하면 같은 key는 upsert로 id가 유지된다(연결이 살아남는 근거)', async () => {
    const repo = await makeRepo(false);
    const adapter = createScriptedAdapter((input) => answerFromPrompt(input.prompt));
    await indexRepoAreas(prisma, { repo: inputFor(repo, false), adapter, redactConfig: null });
    const ids1 = (
      await prisma.repoAnalysis.findMany({ where: { repoId: repo.id }, orderBy: { key: 'asc' } })
    ).map((x) => x.id);
    await indexRepoAreas(prisma, { repo: inputFor(repo, false), adapter, redactConfig: null });
    const ids2 = (
      await prisma.repoAnalysis.findMany({ where: { repoId: repo.id }, orderBy: { key: 'asc' } })
    ).map((x) => x.id);
    expect(ids2).toEqual(ids1);
  });

  test('git 리포가 아닌 경로는 NOT_A_GIT_REPO', async () => {
    const repo = await prisma.repo.create({ data: { name: 'plain', path: dir, readOnly: false } });
    const r = await indexRepoAreas(prisma, {
      repo: { id: repo.id, name: 'plain', path: dir, readOnly: false },
      adapter: createScriptedAdapter(() => ''),
      redactConfig: null,
    });
    expect(r).toEqual({ ok: false, code: 'NOT_A_GIT_REPO' });
  });
});

describe('upsertRepoAnalysis', () => {
  test('포인터가 비면 POINTERS_EMPTY로 거부하고 저장하지 않는다', async () => {
    const repo = await makeRepo(false);
    const draft: AreaAnalysisDraft = {
      kind: 'area',
      key: 'area:x',
      title: 't',
      summary: 's',
      keywords: [],
      pointers: [],
      period: null,
      summaryOnly: false,
      modelId: 'mock',
      usage: { inputTokens: 1, outputTokens: 1 },
      costUsd: 0,
      filtered: false,
      redacted: false,
    };
    expect(await upsertRepoAnalysis(prisma, repo.id, draft)).toEqual({
      ok: false,
      code: 'POINTERS_EMPTY',
    });
    expect(await prisma.repoAnalysis.count()).toBe(0);
  });
});
