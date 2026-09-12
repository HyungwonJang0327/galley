// 워커 프로세스 스모크 — 실제 `node bin/worker.ts`를 띄워 SIGTERM에 깨끗이 종료되는지만 본다.
// 단언은 **종료 코드와 로그 한 줄**뿐이다(타이밍 단언 없음). 결정적이어야 정상이고, 흔들린다면
// 테스트가 아니라 워커 종료 경로에 버그가 있는 것이다(decisions/run-execution-model.md §3).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
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

describe('워커 프로세스', () => {
  test('SIGTERM을 받으면 종료 코드 0으로 끝나고 "워커 종료"를 남긴다', async () => {
    const child = spawn(process.execPath, ['bin/worker.ts'], {
      cwd: packageRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // 기동 로그가 찍힌 뒤에 신호를 보낸다 — 그 전에 보내면 핸들러가 아직 없다.
    await new Promise<void>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('워커 시작')) resolve();
      });
      child.on('exit', (code) => reject(new Error(`기동 전에 종료됐다(code ${code}): ${stderr}`)));
    });

    child.kill('SIGTERM');
    const exitCode = await new Promise<number | null>((resolve) => child.on('exit', resolve));

    expect(exitCode, stderr).toBe(0);
    expect(stdout).toContain('워커 종료');
  });
});
