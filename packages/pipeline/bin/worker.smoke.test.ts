// 워커 프로세스 스모크 — 실제 `node bin/worker.ts`를 띄워 SIGTERM에 깨끗이 종료되는지만 본다.
// 단언은 **종료 코드와 로그 한 줄**뿐이다(타이밍 단언 없음). 결정적이어야 정상이고, 흔들린다면
// 테스트가 아니라 워커 종료 경로에 버그가 있는 것이다(decisions/run-execution-model.md §3).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));

let dbDir: string;
let databaseUrl: string;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-worker-smoke-'));
  databaseUrl = `file:${join(dbDir, 'smoke.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'ignore',
  });
});

afterAll(async () => {
  await rm(dbDir, { recursive: true, force: true });
});

/**
 * 워커를 띄우고 stdout·stderr·종료 코드를 모은다. `ready`가 보이면 SIGTERM을 보낸다(기동 실패 케이스는 그냥 끝난다).
 * 값이 `undefined`인 키는 환경에서 **지운다** — 실모드 케이스의 NODE_ENV(테스트 러너의 test가 상속되면 Mock 모드가 된다),
 * 그리고 개발자 셸의 REDACT_CONFIG_PATH·THUMBNAIL_CONFIG_PATH·GALLEY_CHROME(깨진 파일을 가리키면 케이스가 흔들린다 — 리포 기본값만 쓴다).
 */
function spawnWorker(env: Record<string, string | undefined>, ready?: string) {
  const merged: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    REDACT_CONFIG_PATH: undefined,
    THUMBNAIL_CONFIG_PATH: undefined,
    GALLEY_CHROME: undefined,
    ...env,
  };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  const child = spawn(process.execPath, ['bin/worker.ts'], {
    cwd: packageRoot,
    env: merged,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let signalled = false;
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
    // 기동 로그를 본 뒤 한 번만 보낸다 — 그 전에 보내면 핸들러가 없고, 거듭 보내면 종료 경로가 아니라 신호 처리를 시험하게 된다.
    if (!signalled && ready !== undefined && stdout.includes(ready)) {
      signalled = true;
      child.kill('SIGTERM');
    }
  });
  // `exit`가 아니라 `close`에서 푼다 — exit 시점엔 stdio 파이프가 아직 흘러 마지막 로그("워커 종료")가 빠질 수 있다.
  return new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolve) =>
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr })),
  );
}

describe('워커 프로세스', () => {
  test('SIGTERM을 받으면 종료 코드 0으로 끝나고 "워커 종료"를 남긴다', async () => {
    const { exitCode, stdout, stderr } = await spawnWorker({ NODE_ENV: 'test' }, '워커 시작');

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain('워커 종료');
  });

  test('식별 정보 필터 설정이 깨져 있으면 기동하지 않고 종료 코드 1', async () => {
    const broken = join(dbDir, 'broken-redact.json');
    await writeFile(broken, '{ not json');
    const { exitCode, stdout, stderr } = await spawnWorker({
      NODE_ENV: 'test',
      REDACT_CONFIG_PATH: broken,
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('식별 정보 필터 설정이 깨져');
    expect(stdout).not.toContain('워커 시작');
  });

  test('썸네일 설정이 깨져 있으면 기동하지 않고 종료 코드 1', async () => {
    const broken = join(dbDir, 'broken-thumbnail.json');
    await writeFile(broken, '{ nope');
    const { exitCode, stdout, stderr } = await spawnWorker({
      NODE_ENV: 'test',
      THUMBNAIL_CONFIG_PATH: broken,
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('썸네일 설정');
    expect(stdout).not.toContain('워커 시작');
  });

  test('실모드(NODE_ENV 없음)에서 DATA_DIR이 없으면 기동하지 않고 종료 코드 1', async () => {
    const { exitCode, stdout, stderr } = await spawnWorker({ NODE_ENV: undefined, DATA_DIR: '' });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('DATA_DIR이 규칙에 맞지 않아');
    expect(stderr).toContain('DATA_DIR_MISSING');
    expect(stdout).not.toContain('워커 시작');
  });

  test('실모드에서 DATA_DIR이 BLOG_DIR 안이면 기동하지 않는다', async () => {
    const { exitCode, stderr } = await spawnWorker({
      NODE_ENV: undefined,
      BLOG_DIR: dbDir,
      DATA_DIR: join(dbDir, 'data'),
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('DATA_DIR_INSIDE_BLOG_DIR');
  });

  test('실모드에서 DATA_DIR·PROMPTS_DIR이 맞으면 실제 러너로 기동하고 SIGTERM에 0으로 끝난다', async () => {
    const { exitCode, signal, stdout, stderr } = await spawnWorker(
      {
        NODE_ENV: undefined,
        BLOG_DIR: join(dbDir, 'blog'),
        DATA_DIR: join(dbDir, 'data'),
        PROMPTS_DIR: join(dbDir, 'prompts'),
      },
      '워커 시작',
    );
    expect(exitCode, `signal=${signal}\nstdout=${stdout}\nstderr=${stderr}`).toBe(0);
    expect(stdout).toContain('단계 러너: 실제');
    expect(stdout).toContain('워커 종료');
  });

  test('Mock 모드(NODE_ENV=test)는 DATA_DIR 없이도 Mock 러너로 기동한다(산출물은 안 쓴다)', async () => {
    const { exitCode, stdout } = await spawnWorker({ NODE_ENV: 'test', DATA_DIR: '' }, '워커 시작');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('단계 러너: Mock(DATA_DIR 없음');
  });

  test('Mock 모드에 DATA_DIR이 규칙에 안 맞으면(상대경로) error 로그로 알리고 안 쓰는 Mock으로 기동한다', async () => {
    const { exitCode, stdout, stderr } = await spawnWorker(
      { NODE_ENV: 'test', DATA_DIR: './relative-data' },
      '워커 시작',
    );
    expect(exitCode).toBe(0);
    expect(stderr).toContain('단계 러너: Mock(DATA_DIR 없음');
    expect(stderr).toContain('DATA_DIR_NOT_ABSOLUTE');
    expect(stdout).toContain('워커 시작');
  });

  test('Mock 모드에 DATA_DIR이 있으면 산출물을 쓰는 Mock 러너로 기동한다', async () => {
    const { exitCode, stdout } = await spawnWorker(
      { NODE_ENV: 'test', DATA_DIR: dbDir, BLOG_DIR: '' },
      '워커 시작',
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('단계 러너: Mock(DATA_DIR에 산출물 쓰기)');
  });
});
