// tmpdir 픽스처 리포로만 테스트한다(회사 리포 미열람). git이 필요하다(CI 러너에 있음).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { gitHead, gitListFiles, gitShowFile, isCommitRef } from './gitRead.ts';
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
