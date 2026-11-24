// 픽스처 git 리포(tmpdir)로만 — 실제 리포는 열지 않는다.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectHistory } from './history.ts';
import { EVIDENCE_LIMITS } from './limits.ts';
import type { RedactConfig } from './redact.ts';

let dir: string;
let repo: string;
let empty: string;
const shas: string[] = [];
const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t.test',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t.test',
};
const g = (cwd: string, date: string, ...args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  }).trim();
const commit = (date: string, message: string) => {
  g(repo, date, 'add', '.');
  g(repo, date, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
  shas.push(g(repo, date, 'rev-parse', 'HEAD'));
};
const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-history-'));
  repo = join(dir, 'repo');
  empty = join(dir, 'empty');
  await mkdir(join(repo, 'src'), { recursive: true });
  await mkdir(empty, { recursive: true });
  for (const cwd of [repo, empty])
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd, env: ENV });

  await writeFile(join(repo, 'src', 'feed.ts'), 'export const feed = 1;\n');
  await writeFile(join(repo, 'src', 'post.ts'), 'export const post = 1;\n');
  await writeFile(join(repo, 'README.md'), '# r\n');
  commit('2026-06-17T10:00:00+09:00', 'feat: 피드와 포스트 초기 구현\n\nExample Corp 요구로 시작.');
  await writeFile(join(repo, 'README.md'), '# r\n\nmore\n');
  commit('2026-06-18T10:00:00+09:00', 'docs: README');
  await writeFile(
    join(repo, 'src', 'feed.ts'),
    'export const feed = 2;\nexport const cursor = 1;\n',
  );
  commit('2026-06-20T10:00:00+09:00', `fix: 커서 경계 중복\n\n${'가'.repeat(30)}`);
  await writeFile(join(repo, 'src', 'post.ts'), 'export const post = 2;\n');
  await writeFile(join(repo, 'src', 'extra.ts'), 'export const extra = 1;\n');
  commit(
    '2026-06-25T10:00:00+09:00',
    'refactor: 포스트 정리\n\nCo-Authored-By: Someone <someone@example.test>\nSigned-off-by: t <t@t.test>',
  );
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const target = () => ({
  name: 'Example Corp api',
  path: repo,
  paths: ['src/feed.ts', 'src/post.ts'],
});

describe('collectHistory', () => {
  test('조각 경로를 건드린 커밋만, 오래된 순으로 — 날짜·제목·본문·파일·줄 수', async () => {
    const r = await collectHistory([target()], null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.omitted).toBe(0);
    expect(r.history.map((c) => [c.commit, c.date.slice(0, 10), c.subject])).toEqual([
      [shas[0], '2026-06-17', 'feat: 피드와 포스트 초기 구현'],
      [shas[2], '2026-06-20', 'fix: 커서 경계 중복'],
      [shas[3], '2026-06-25', 'refactor: 포스트 정리'],
    ]);
    expect(r.history[0]).toMatchObject({
      repo: 'Example Corp api',
      paths: ['src/feed.ts', 'src/post.ts'],
      body: 'Example Corp 요구로 시작.',
      fileCount: 3,
      redacted: false,
      truncated: false,
    });
    // 조각 파일이 먼저, 그 밖의 파일(README)은 뒤
    expect(r.history[0]!.files).toEqual([
      { status: 'A', path: 'src/feed.ts', added: 1, deleted: 0 },
      { status: 'A', path: 'src/post.ts', added: 1, deleted: 0 },
      { status: 'A', path: 'README.md', added: 1, deleted: 0 },
    ]);
    expect(r.history[1]!.files).toEqual([
      { status: 'M', path: 'src/feed.ts', added: 2, deleted: 1 },
    ]);
    expect(r.history[2]!.paths).toEqual(['src/post.ts']);
    // 서명 꼬리표(이름·이메일)는 본문에서 뺀다
    expect(r.history[2]!.body).toBe('');
    expect(JSON.stringify(r.history)).not.toContain('example.test');
  });

  test('제목·본문·리포 이름은 식별 정보 필터를 거치고, 본문·파일 목록은 상한으로 잘린다', async () => {
    const r = await collectHistory([target()], REDACT, {
      ...EVIDENCE_LIMITS,
      historyBodyChars: 10,
      historyFilesPerCommit: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(r.history)).not.toContain('Example Corp');
    expect(r.history[0]).toMatchObject({
      repo: '[COMPANY] api',
      body: '[COMPANY] ',
      redacted: true,
      truncated: true,
      fileCount: 3,
    });
    expect(r.history[0]!.files).toEqual([
      { status: 'A', path: 'src/feed.ts', added: 1, deleted: 0 },
    ]);
    expect(r.history[1]).toMatchObject({ body: '가'.repeat(10), truncated: true });
    // 파일 2개 중 1개만 실렸다 — 조각 파일(post.ts)이 남는다
    expect(r.history[2]).toMatchObject({ truncated: true, fileCount: 2 });
    expect(r.history[2]!.files.map((f) => f.path)).toEqual(['src/post.ts']);
  });

  test('상한을 넘으면 조각 파일을 많이 건드린 커밋 먼저, 같으면 오래된 것 먼저 남기고 시간순으로 싣는다', async () => {
    const r = await collectHistory([target()], null, { ...EVIDENCE_LIMITS, maxHistoryCommits: 2 });
    expect(r.ok && r.history.map((c) => c.commit)).toEqual([shas[0], shas[2]]);
    expect(r.ok && r.omitted).toBe(1);
  });

  test('경로가 없거나 커밋이 없는 리포는 0건, git 리포가 아니면 값으로 실패', async () => {
    expect(await collectHistory([{ ...target(), paths: [] }], null)).toEqual({
      ok: true,
      history: [],
      omitted: 0,
    });
    expect(await collectHistory([{ name: 'e', path: empty, paths: ['a.ts'] }], null)).toEqual({
      ok: true,
      history: [],
      omitted: 0,
    });
    expect(await collectHistory([{ name: 'x', path: tmpdir(), paths: ['a.ts'] }], null)).toEqual({
      ok: false,
      code: 'NOT_A_GIT_REPO',
    });
  });
});
