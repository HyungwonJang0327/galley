// 인덱싱 CLI 스모크 — 실제 `node bin/index.ts`를 임시 SQLite·픽스처 리포로 띄워 종료 코드와 출력만 본다.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
let dir: string;
let repoPath: string;
let env: NodeJS.ProcessEnv;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-index-cli-'));
  repoPath = join(dir, 'fixture-repo');
  await mkdir(repoPath, { recursive: true });
  const gitEnv = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t.test',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t.test',
  };
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoPath, env: gitEnv });
  await writeFile(join(repoPath, 'a.txt'), 'a\n');
  execFileSync('git', ['add', '.'], { cwd: repoPath, env: gitEnv });
  execFileSync('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init'], {
    cwd: repoPath,
    env: gitEnv,
  });
  const databaseUrl = `file:${join(dir, 'cli.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'ignore',
  });
  // Mock 모델은 development에서만 레지스트리에 있다(API 키 없이 돈다).
  env = { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development' };
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const run = (...args: string[]) =>
  spawnSync(process.execPath, ['bin/index.ts', ...args], {
    cwd: packageRoot,
    env,
    encoding: 'utf8',
  });

describe('index CLI', () => {
  test('리포를 등록하고 full 작업을 큐에 넣는다 → 두 번째는 활성 작업으로 거부 → 인자 없으면 사용법', () => {
    const first = run(repoPath, '--model', 'mock', '--alias', 'fx');
    expect(first.status, first.stderr).toBe(0);
    const line = first.stdout.split('\n').find((l) => l.startsWith('{'))!;
    const out = JSON.parse(line) as {
      repo: { name: string; created: boolean };
      job?: { kind: string };
      model: string;
    };
    expect(out.repo).toMatchObject({ name: 'fixture-repo', created: true });
    expect(out.job?.kind).toBe('full');
    expect(out.model).toBe('mock');
    expect(first.stdout).toContain('워커가 집어갑니다');

    const again = run(repoPath, '--model', 'mock');
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('끝나지 않은 인덱싱 작업');

    const usage = run();
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain('사용법');

    const badModel = run(repoPath, '--model', 'nope');
    expect(badModel.status).toBe(2);
    expect(badModel.stderr).toContain('레지스트리에 없습니다');
  });

  test('깨진 필터 설정이면 readOnly가 아니어도 exit 2, 없는 설정이면 readOnly만 exit 2', async () => {
    const broken = join(dir, 'broken-redact.json');
    await writeFile(broken, '{ not json');
    const invalid = spawnSync(process.execPath, ['bin/index.ts', repoPath, '--model', 'mock'], {
      cwd: packageRoot,
      env: { ...env, REDACT_CONFIG_PATH: broken },
      encoding: 'utf8',
    });
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain('REDACT_CONFIG_INVALID');
    const missing = spawnSync(
      process.execPath,
      ['bin/index.ts', repoPath, '--model', 'mock', '--read-only'],
      {
        cwd: packageRoot,
        env: { ...env, REDACT_CONFIG_PATH: join(dir, 'nope.json') },
        encoding: 'utf8',
      },
    );
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain('REDACT_CONFIG_MISSING');
  });
});
