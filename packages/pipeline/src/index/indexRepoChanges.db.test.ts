// 통합: tmpdir 픽스처 git 리포(두 달에 걸친 커밋, 이름 바꿈·삭제 포함) + 임시 SQLite + 스크립트 어댑터. 회사 리포는 열지 않는다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { indexRepoChanges, type ChangeProgress } from './indexRepoChanges.ts';
import { indexRepoOverview } from './indexRepoOverview.ts';
import { indexRepoAreas } from './indexRepoAreas.ts';
import { gitShowFile } from './gitRead.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { parsePointers, REPO_STATUS } from './schema.ts';
import { INDEX_LIMITS } from './limits.ts';
import type { RedactConfig } from '../evidence/redact.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir: string;
let repoPath: string;
let prisma: PrismaClient;
const shas: string[] = [];

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t.test',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t.test',
};
const g = (env: Record<string, string>, ...args: string[]) =>
  execFileSync('git', args, {
    cwd: repoPath,
    env: { ...GIT_ENV, ...env },
    encoding: 'utf8',
  }).trim();
const commit = (date: string, message: string) => {
  g(
    { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    message,
  );
  shas.push(g({}, 'rev-parse', 'HEAD'));
};

const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};

/** 프롬프트의 기간과 첫 상세 커밋의 첫 파일(삭제면 그대로 — 부모 기준으로 풀린다)로 답한다. */
const answerChange = (prompt: string) => {
  const period = /기간: (\S+)/.exec(prompt)![1]!;
  const m = /### ([0-9a-f]{7}) .*\n(?:.*\n)*?파일: ([ADMT]) (\S+)/.exec(prompt);
  return JSON.stringify({
    title: `${period} 변경 (Example Corp)`,
    summary: `${period}에 한 일.`,
    keywords: [period, 'Example Corp'],
    pointers: m ? [{ commit: m[1], path: m[3], note: `${m[2]} ${m[3]}` }] : [],
  });
};
const answerArea = (prompt: string) => {
  const dirName = /디렉터리: (.+)/.exec(prompt)![1]!;
  const file = /### (\S+)/.exec(prompt)?.[1];
  return JSON.stringify({
    title: `${dirName} 영역`,
    summary: `${dirName} 요약.`,
    keywords: [dirName],
    pointers: file ? [{ path: file, lineStart: 1, lineEnd: 1 }] : [],
  });
};
const answerOverview = (prompt: string) => {
  const keys = [...prompt.matchAll(/### (\S+) — /g)].map((m) => m[1]!);
  return JSON.stringify({
    title: 'fixture 개요 (Example Corp)',
    summary: '픽스처 리포 개요.',
    keywords: ['fixture'],
    sources: keys
      .filter((k) => k.startsWith('change:'))
      .slice(0, 1)
      .concat(keys.filter((k) => k.startsWith('area:src'))),
  });
};
const answerAny = (prompt: string) =>
  prompt.startsWith('리포지토리') && prompt.includes('## 영역별 분석 글')
    ? answerOverview(prompt)
    : prompt.includes('## 커밋')
      ? answerChange(prompt)
      : answerArea(prompt);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-changes-'));
  repoPath = join(dir, 'repo');
  await mkdir(join(repoPath, 'src'), { recursive: true });
  await mkdir(join(repoPath, 'docs'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoPath, env: GIT_ENV });
  await writeFile(join(repoPath, 'README.md'), '# fixture\n');
  await writeFile(join(repoPath, 'src', 'a.ts'), 'export const a = 1;\n');
  await writeFile(join(repoPath, '.env'), 'SECRET=should-never-reach-the-model\n');
  g({}, 'add', '-f', '.');
  commit('2024-03-05T10:00:00+09:00', 'init');
  await writeFile(join(repoPath, 'docs', 'g.md'), 'guide\n');
  g({}, 'add', '.');
  commit('2024-03-20T10:00:00+09:00', 'docs: guide\n\nExample Corp 가이드');
  g({}, 'mv', 'src/a.ts', 'src/b.ts');
  g({}, 'rm', '-q', 'README.md');
  commit('2024-04-01T10:00:00+09:00', 'chore: rename+delete');
  await writeFile(join(repoPath, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  g({}, 'add', '.');
  commit('2024-04-02T10:00:00+09:00', 'chore: lockfile only');

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
  const repo = await prisma.repo.create({ data: { name: 'fixture', path: repoPath, readOnly } });
  return { id: repo.id, name: 'fixture', path: repoPath, readOnly };
}

describe('indexRepoChanges', () => {
  test('월별 change 글을 저장하고(period·포인터는 커밋에 실존·삭제는 부모 기준·redact) Repo·리포는 건드리지 않는다', async () => {
    const repo = await makeRepo(true);
    const adapter = createScriptedAdapter((i) => answerChange(i.prompt));
    const progress: ChangeProgress[] = [];
    const before = g({}, 'status', '--porcelain');
    const r = await indexRepoChanges(prisma, {
      repo,
      adapter,
      redactConfig: REDACT,
      onBatchDone: (p) => void progress.push(p),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({
      headSha: shas[3],
      totalCommits: 4,
      truncated: false,
      emptyCommits: 0,
      ignoredCommits: 1,
      planned: 2,
      saved: 2,
      summaryOnly: 0,
      skipped: [],
      resumedPast: 0,
    });
    expect(r.report.usage.inputTokens).toBeGreaterThan(0);
    expect(JSON.stringify(r.report)).not.toMatch(/src|docs|README|2024-0/); // 수치만
    expect(progress.map((p) => `${p.key}:${p.status}:${p.done}/${p.total}`)).toEqual([
      'change:2024-03:saved:1/2',
      'change:2024-04:saved:2/2',
    ]);
    expect(adapter.calls.some((c) => c.prompt.includes('should-never-reach'))).toBe(false);
    expect(adapter.calls.some((c) => c.prompt.includes('pnpm-lock'))).toBe(false);

    const rows = await prisma.repoAnalysis.findMany({
      where: { repoId: repo.id },
      orderBy: { key: 'asc' },
    });
    expect(rows.map((x) => [x.kind, x.key, x.period])).toEqual([
      ['change', 'change:2024-03', '2024-03'],
      ['change', 'change:2024-04', '2024-04'],
    ]);
    const march = rows[0]!;
    expect(march.title).toBe('2024-03 변경 ([COMPANY])');
    expect(march.filtered).toBe(true);
    expect(march.redacted).toBe(true);
    expect(parsePointers(march.pointers)).toEqual([
      { commit: shas[0], path: 'README.md', note: 'A README.md' },
    ]);
    // 4월 묶음의 첫 파일은 삭제(D README.md) → 부모 커밋(3월 20일) 기준 포인터
    expect(parsePointers(rows[1]!.pointers)).toEqual([
      { commit: shas[1], path: 'README.md', note: 'D README.md' },
    ]);
    // 완료 조건: 저장된 모든 포인터가 실제 커밋·경로를 가리킨다
    for (const row of rows)
      for (const p of parsePointers(row.pointers))
        expect((await gitShowFile(repoPath, p.commit, p.path)).ok, `${row.key} → ${p.path}`).toBe(
          true,
        );

    const untouched = await prisma.repo.findUniqueOrThrow({ where: { id: repo.id } });
    expect(untouched.status).toBe(REPO_STATUS.indexing);
    expect(untouched.headSha).toBeNull();
    expect(g({}, 'status', '--porcelain')).toBe(before);
    expect(g({}, 'rev-parse', 'HEAD')).toBe(shas[3]);
  });

  test('fromSha(증분)는 그 다음 커밋만 읽고, maxCommits에 걸리면 truncated', async () => {
    const repo = await makeRepo(false);
    const adapter = createScriptedAdapter((i) => answerChange(i.prompt));
    const inc = await indexRepoChanges(prisma, {
      repo,
      adapter,
      redactConfig: null,
      fromSha: shas[1],
    });
    expect(inc.ok && inc.report).toMatchObject({
      totalCommits: 2,
      ignoredCommits: 1,
      planned: 1,
      saved: 1,
    });
    const keys = (await prisma.repoAnalysis.findMany({ where: { repoId: repo.id } })).map(
      (x) => x.key,
    );
    expect(keys).toEqual(['change:2024-04']);
    const capped = await indexRepoChanges(prisma, {
      repo,
      adapter,
      redactConfig: null,
      limits: { ...INDEX_LIMITS, maxCommits: 2 },
    });
    expect(capped.ok && capped.report).toMatchObject({ totalCommits: 2, truncated: true });
    const exact = await indexRepoChanges(prisma, {
      repo,
      adapter,
      redactConfig: null,
      limits: { ...INDEX_LIMITS, maxCommits: 4 },
    });
    expect(exact.ok && exact.report).toMatchObject({ totalCommits: 4, truncated: false });
  });

  test('readOnly + 설정 없음은 REDACT_CONFIG_REQUIRED, 깨진 출력은 skipped, 호출 실패는 MODEL_FAILED(partial), skipKeys 재개', async () => {
    const repo = await makeRepo(true);
    expect(
      await indexRepoChanges(prisma, {
        repo,
        adapter: createScriptedAdapter(() => ''),
        redactConfig: null,
      }),
    ).toEqual({ ok: false, code: 'REDACT_CONFIG_REQUIRED' });

    const broken = await indexRepoChanges(prisma, {
      repo,
      adapter: createScriptedAdapter((i) =>
        i.prompt.includes('기간: 2024-04') ? '???' : answerChange(i.prompt),
      ),
      redactConfig: REDACT,
    });
    expect(broken.ok && broken.report).toMatchObject({ saved: 1, skipped: ['change:2024-04'] });

    const failed = await indexRepoChanges(prisma, {
      repo,
      adapter: createScriptedAdapter((i, n) => {
        if (n === 1) throw new Error('401');
        return answerChange(i.prompt);
      }),
      redactConfig: REDACT,
    });
    expect(failed).toMatchObject({
      ok: false,
      code: 'MODEL_FAILED',
      errorName: 'Error',
      partial: { saved: 1 },
    });

    const resumed = createScriptedAdapter((i) => answerChange(i.prompt));
    const r = await indexRepoChanges(prisma, {
      repo,
      adapter: resumed,
      redactConfig: REDACT,
      skipKeys: ['change:2024-03'],
    });
    expect(r.ok && r.report).toMatchObject({ planned: 2, saved: 1, resumedPast: 1 });
    expect(resumed.calls).toHaveLength(1);
  });

  test('git 리포가 아닌 경로는 NOT_A_GIT_REPO', async () => {
    const repo = await prisma.repo.create({ data: { name: 'plain', path: dir, readOnly: false } });
    expect(
      await indexRepoChanges(prisma, {
        repo: { id: repo.id, name: 'plain', path: dir, readOnly: false },
        adapter: createScriptedAdapter(() => ''),
        redactConfig: null,
      }),
    ).toEqual({ ok: false, code: 'NOT_A_GIT_REPO' });
  });
});

describe('indexRepoOverview', () => {
  test('area·change 글을 입력으로 overview를 저장하고 출처 글의 포인터를 물려받는다(재실행은 upsert)', async () => {
    const repo = await makeRepo(true);
    const adapter = createScriptedAdapter((i) => answerAny(i.prompt));
    expect((await indexRepoAreas(prisma, { repo, adapter, redactConfig: REDACT })).ok).toBe(true);
    expect((await indexRepoChanges(prisma, { repo, adapter, redactConfig: REDACT })).ok).toBe(true);
    const r = await indexRepoOverview(prisma, { repo, adapter, redactConfig: REDACT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report).toMatchObject({ sources: 4, summaryOnly: false });
    expect(r.report.analysisId).toBeDefined();
    const row = await prisma.repoAnalysis.findUniqueOrThrow({
      where: { repoId_key: { repoId: repo.id, key: 'overview' } },
    });
    expect(row.kind).toBe('overview');
    expect(row.period).toBeNull();
    expect(row.title).toBe('fixture 개요 ([COMPANY])');
    const pointers = parsePointers(row.pointers);
    expect(pointers.map((p) => p.note)).toEqual(['2024-03 변경 ([COMPANY])', 'src 영역']);
    for (const p of pointers) expect((await gitShowFile(repoPath, p.commit, p.path)).ok).toBe(true);
    // 프롬프트에는 다른 글의 제목·요약만 들어가고 파일 본문은 없다
    const overviewCall = adapter.calls.at(-1)!;
    expect(overviewCall.prompt).toContain('### area:src — src 영역');
    expect(overviewCall.prompt).not.toContain('export const');

    const again = await indexRepoOverview(prisma, { repo, adapter, redactConfig: REDACT });
    expect(again.ok && again.report.analysisId).toBe(r.report.analysisId);
    expect(await prisma.repoAnalysis.count({ where: { repoId: repo.id, kind: 'overview' } })).toBe(
      1,
    );
  });

  test('재료가 없으면 NO_SOURCES, 깨진 출력은 저장 없이 usage만, 호출 실패는 MODEL_FAILED', async () => {
    const repo = await makeRepo(false);
    expect(
      await indexRepoOverview(prisma, {
        repo,
        adapter: createScriptedAdapter(() => ''),
        redactConfig: null,
      }),
    ).toEqual({
      ok: false,
      code: 'NO_SOURCES',
    });
    await indexRepoAreas(prisma, {
      repo,
      adapter: createScriptedAdapter((i) => answerArea(i.prompt)),
      redactConfig: null,
    });
    const broken = await indexRepoOverview(prisma, {
      repo,
      adapter: createScriptedAdapter(() => '???'),
      redactConfig: null,
    });
    expect(broken.ok && broken.report.analysisId).toBeUndefined();
    expect(broken.ok && broken.report.usage.inputTokens).toBeGreaterThan(0);
    expect(await prisma.repoAnalysis.count({ where: { repoId: repo.id, kind: 'overview' } })).toBe(
      0,
    );
    const failed = await indexRepoOverview(prisma, {
      repo,
      adapter: createScriptedAdapter(() => {
        throw new Error('429');
      }),
      redactConfig: null,
    });
    expect(failed).toEqual({ ok: false, code: 'MODEL_FAILED', errorName: 'Error' });
    expect(
      await indexRepoOverview(prisma, {
        repo: { ...repo, readOnly: true },
        adapter: createScriptedAdapter(() => ''),
        redactConfig: null,
      }),
    ).toEqual({ ok: false, code: 'REDACT_CONFIG_REQUIRED' });
  });
});
