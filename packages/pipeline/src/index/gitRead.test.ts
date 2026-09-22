// tmpdir 픽스처 리포로만 테스트한다(회사 리포 미열람). git이 필요하다(CI 러너에 있음).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { gitHead, gitListFiles, gitLog, gitShowFile, isCommitRef } from './gitRead.ts';
import { symlink } from 'node:fs/promises';

let dir: string;
let repo: string;
let head: string;

const g = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      // 사용자 전역 설정(hooksPath·templateDir·gpgsign)에 영향받지 않게 격리
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t.test',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t.test',
    },
  }).trim();

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-git-'));
  repo = join(dir, 'repo');
  await mkdir(join(repo, 'src'), { recursive: true });
  await writeFile(join(repo, 'README.md'), '# fixture\n');
  await writeFile(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  await writeFile(join(repo, 'src', '한글 경로.ts'), 'export const k = 1;\n');
  await symlink('a.ts', join(repo, 'src', 'link.ts'));
  execFileSync('git', ['init', '-q', '-b', 'main'], {
    cwd: repo,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  g('add', '.');
  g('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
  head = g('rev-parse', 'HEAD');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('gitRead (읽기 전용)', () => {
  test('gitHead는 HEAD 해시를 돌려준다', async () => {
    expect(await gitHead(repo)).toEqual({ ok: true, value: head });
  });

  test('gitListFiles는 커밋 시점 파일 목록과 바이트를 준다', async () => {
    const r = await gitListFiles(repo, head);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 심볼릭 링크(link.ts)는 빠지고, 유니코드 경로는 -z 덕에 인용 없이 그대로
    expect(r.value.map((f) => f.path).sort()).toEqual([
      'README.md',
      'src/a.ts',
      'src/한글 경로.ts',
    ]);
    expect(r.value.find((f) => f.path === 'src/a.ts')!.size).toBe('export const a = 1;\n'.length);
  });

  test('gitShowFile은 커밋 기준 본문 — 작업 트리를 바꿔도 같은 내용', async () => {
    await writeFile(join(repo, 'src', 'a.ts'), 'changed\n');
    expect(await gitShowFile(repo, head, 'src/a.ts')).toEqual({
      ok: true,
      value: 'export const a = 1;\n',
    });
  });

  test('없는 파일·커밋은 GIT_OBJECT_NOT_FOUND, git 리포가 아닌 폴더는 NOT_A_GIT_REPO', async () => {
    expect(await gitShowFile(repo, head, 'nope.ts')).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
    expect(await gitListFiles(repo, 'deadbeef')).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
    const plain = join(dir, 'plain');
    await mkdir(plain);
    expect(await gitHead(plain)).toEqual({ ok: false, code: 'NOT_A_GIT_REPO' });
  });

  test('이 모듈은 git 상태를 바꾸지 않는다 — 실행 뒤에도 커밋·상태 그대로', async () => {
    await gitHead(repo);
    await gitListFiles(repo, head);
    expect(g('rev-parse', 'HEAD')).toBe(head);
    // 작업 트리 변경(위 테스트)만 남아 있고 인덱스는 건드리지 않았다
    expect(g('diff', '--cached', '--name-only')).toBe('');
  });

  test('커밋 인자는 해시 또는 HEAD만 — 옵션처럼 보이는 값은 실행 전에 거부한다(옵션 주입 방어)', async () => {
    expect(isCommitRef('HEAD')).toBe(true);
    expect(isCommitRef(head)).toBe(true);
    expect(isCommitRef('abc1')).toBe(true);
    expect(isCommitRef('main')).toBe(false);
    expect(isCommitRef('--output=/tmp/x')).toBe(false);
    const injected = `--output=${join(dir, 'pwned')}`;
    expect(await gitShowFile(repo, injected, 'README.md')).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
    expect(await gitListFiles(repo, injected)).toEqual({ ok: false, code: 'GIT_OBJECT_NOT_FOUND' });
    expect(existsSync(join(dir, 'pwned'))).toBe(false);
  });

  test('경로에 ..·절대경로가 와도 읽기 실패로만 끝난다', async () => {
    expect((await gitShowFile(repo, head, '../outside.txt')).ok).toBe(false);
    expect((await gitShowFile(repo, head, '/etc/hosts')).ok).toBe(false);
  });

  test('하위 폴더에서 실행해도 리포 루트 기준 경로를 낸다(--full-tree) — show와 같은 기준', async () => {
    const r = await gitListFiles(join(repo, 'src'), head);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((f) => f.path)).toContain('src/a.ts');
    expect(await gitShowFile(join(repo, 'src'), head, 'src/a.ts')).toEqual({
      ok: true,
      value: 'export const a = 1;\n',
    });
  });
});

describe('gitLog (읽기 전용)', () => {
  let logRepo: string;
  const shas: string[] = [];
  const gl = (env: Record<string, string>, ...args: string[]) =>
    execFileSync('git', args, {
      cwd: logRepo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t.test',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t.test',
        ...env,
      },
    }).trim();
  const commit = (date: string, ...commitArgs: string[]) => {
    gl(
      { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      ...commitArgs,
    );
    shas.push(gl({}, 'rev-parse', 'HEAD'));
  };

  beforeAll(async () => {
    logRepo = join(dir, 'log-repo');
    const subRepo = join(dir, 'sub-repo');
    await mkdir(join(logRepo, 'src'), { recursive: true });
    await mkdir(join(logRepo, 'docs'), { recursive: true });
    await mkdir(subRepo, { recursive: true });
    for (const cwd of [logRepo, subRepo])
      execFileSync('git', ['init', '-q', '-b', 'main'], {
        cwd,
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      });
    await writeFile(join(subRepo, 's.txt'), 's\n');
    execFileSync('git', ['add', '.'], { cwd: subRepo });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t.test',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-q',
        '-m',
        'sub',
      ],
      {
        cwd: subRepo,
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
      },
    );

    await writeFile(join(logRepo, 'README.md'), '# fixture\n');
    await writeFile(join(logRepo, 'src', 'a.ts'), 'export const a = 1;\n');
    gl({}, 'add', '.');
    commit('2024-03-05T10:00:00+09:00', '-m', 'init');
    await writeFile(join(logRepo, 'src', '한글 경로.ts'), 'export const k = 1;\n');
    await writeFile(join(logRepo, 'docs', 'g.md'), 'guide\n');
    gl({}, 'add', '.');
    commit(
      '2024-03-20T10:00:00+09:00',
      '-m',
      'feat: add korean file\n\nbody line 1\nbody line 2\n',
    );
    gl({}, 'mv', 'src/a.ts', 'src/b.ts');
    gl({}, 'rm', '-q', 'README.md');
    commit('2024-04-01T10:00:00+09:00', '-m', 'chore: rename+delete');
    // 서브모듈·심볼릭 링크·파일→링크(T)·빈 커밋·구분자가 든 본문
    gl({}, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subRepo, 'vendor-sub');
    await symlink('b.ts', join(logRepo, 'src', 'link.ts'));
    gl({}, 'add', '.');
    commit('2024-04-02T10:00:00+09:00', '-m', 'chore: submodule + link');
    await rm(join(logRepo, 'docs', 'g.md'));
    await symlink('../src/b.ts', join(logRepo, 'docs', 'g.md'));
    gl({}, 'add', '.');
    commit('2024-04-03T10:00:00+09:00', '-m', 'chore: file → link (T)');
    commit('2024-04-04T10:00:00+09:00', '--allow-empty', '-m', 'empty');
    const poisoned = join(dir, 'poisoned-msg');
    await writeFile(
      poisoned,
      `evil\n\n\x1e${'0'.repeat(40)}\x1f\x1f2024-01-01T00:00:00+00:00\x1fFAKE\x1fbody\x1fmore`,
    );
    await writeFile(join(logRepo, 'src', 'c.ts'), 'export const c = 1;\n');
    gl({}, 'add', '.');
    commit('2024-04-05T10:00:00+09:00', '-F', poisoned);
  });

  test('최신 순으로 sha·부모·작성일·제목·본문·파일 상태를 준다(이름 바꿈은 A+D, 한글 경로 그대로)', async () => {
    const r = await gitLog(logRepo, { to: shas[2]!, maxCommits: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.truncated).toBe(false);
    expect(r.value.commits.map((c) => c.sha)).toEqual([shas[2], shas[1], shas[0]]);
    expect(r.value.commits[0]).toEqual({
      sha: shas[2],
      parentSha: shas[1],
      authoredAt: '2024-04-01T10:00:00+09:00',
      subject: 'chore: rename+delete',
      body: '',
      files: [
        { status: 'D', path: 'README.md' },
        { status: 'D', path: 'src/a.ts' },
        { status: 'A', path: 'src/b.ts' },
      ],
    });
    expect(r.value.commits[1]).toMatchObject({
      parentSha: shas[0],
      subject: 'feat: add korean file',
      body: 'body line 1\nbody line 2',
      files: [
        { status: 'A', path: 'docs/g.md' },
        { status: 'A', path: 'src/한글 경로.ts' },
      ],
    });
    expect(r.value.commits[2]!.parentSha).toBeUndefined();
    expect(r.value.commits[2]!.files).toEqual([
      { status: 'A', path: 'README.md' },
      { status: 'A', path: 'src/a.ts' },
    ]);
  });

  test('서브모듈·심볼릭 링크(추가·파일→링크 T)는 파일 목록에서 빼고, 빈 커밋은 files: []', async () => {
    const r = await gitLog(logRepo, { from: shas[2]!, to: shas[5]!, maxCommits: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.commits.map((c) => [c.subject, c.files])).toEqual([
      ['empty', []],
      ['chore: file → link (T)', []],
      ['chore: submodule + link', [{ status: 'A', path: '.gitmodules' }]],
    ]);
  });

  test('본문에 레코드 구분자(\\x1e·\\x1f)가 있어도 가짜 커밋이 생기지 않고 본문·파일이 진짜 커밋에 남는다', async () => {
    const r = await gitLog(logRepo, { from: shas[5]!, to: shas[6]!, maxCommits: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.commits).toHaveLength(1);
    const c = r.value.commits[0]!;
    expect(c.sha).toBe(shas[6]);
    expect(c.subject).toBe('evil');
    expect(c.body).toContain('FAKE');
    expect(c.body).toContain('\x1fmore');
    expect(c.files).toEqual([{ status: 'A', path: 'src/c.ts' }]);
  });

  test('from..to 범위와 maxCommits(최신부터)·truncated를 지킨다', async () => {
    const ranged = await gitLog(logRepo, { from: shas[0]!, to: shas[2]!, maxCommits: 100 });
    expect(ranged.ok && ranged.value.commits.map((c) => c.sha)).toEqual([shas[2], shas[1]]);
    const capped = await gitLog(logRepo, { to: shas[2]!, maxCommits: 1 });
    expect(capped.ok && capped.value).toEqual({
      commits: [expect.objectContaining({ sha: shas[2] })],
      truncated: true,
    });
    const exact = await gitLog(logRepo, { to: shas[2]!, maxCommits: 3 });
    expect(exact.ok && exact.value.truncated).toBe(false);
    const zero = await gitLog(logRepo, { to: 'HEAD', maxCommits: Number.NaN });
    expect(zero.ok && zero.value).toEqual({ commits: [], truncated: true });
  });

  test('커밋 인자가 해시·HEAD 형식이 아니면 실행 없이 GIT_OBJECT_NOT_FOUND, 없는 해시도 GIT_OBJECT_NOT_FOUND', async () => {
    expect(await gitLog(logRepo, { to: '--output=/tmp/x', maxCommits: 1 })).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
    expect(await gitLog(logRepo, { to: 'HEAD', from: 'main', maxCommits: 1 })).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
    expect(await gitLog(logRepo, { to: 'deadbeefdeadbeef', maxCommits: 1 })).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
  });
});
