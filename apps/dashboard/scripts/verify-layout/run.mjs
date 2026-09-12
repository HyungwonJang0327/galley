// 레이아웃 실측 진입점 (decisions/layout-measurement.md).
//   pnpm --filter dashboard verify:layout [--no-build] [--port 3999] [--url http://localhost:3000] [--out <dir>]
// 기본: next build → next start → /design 을 headless Chrome으로 열어 AppShell 스크롤·Select·Menu 팝업을 실측.
//   --no-build  기존 .next 재사용   --url  떠 있는 서버 사용(빌드·기동 생략)   --out  스크린샷 폴더
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, waitFor } from './cdp.mjs';
import { verifyMenu } from './menu.mjs';
import { verifySelect } from './select.mjs';
import { verifyShellScroll } from './shell-scroll.mjs';
import { verifySplitPane } from './split-pane.mjs';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next');

function parseArgs(argv) {
  const args = { build: true, port: 3999, url: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--no-build') args.build = false;
    else if (arg === '--port') args.port = Number(argv[++i]);
    else if (arg === '--url') args.url = argv[++i].replace(/\/$/, '');
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  return args;
}

function runNext(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: appDir,
      stdio: 'inherit',
      ...options,
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`next ${args[0]} 실패(exit ${code})`)),
    );
  });
}

/** detached로 띄운 next start를 프로세스 그룹째 종료(POSIX). SIGTERM 뒤 안 끝나면 SIGKILL. */
async function killTree(child) {
  if (child.exitCode !== null) return;
  const signal = (sig) => {
    try {
      if (process.platform !== 'win32') process.kill(-child.pid, sig);
      else child.kill(sig);
    } catch {
      // 이미 종료됨
    }
  };
  const exited = new Promise((resolve) => child.once('exit', resolve));
  signal('SIGTERM');
  // next start는 SIGTERM에 graceful shutdown을 시도하며 끝나지 않을 수 있다.
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000, 'timeout'));
  if ((await Promise.race([exited, timeout])) === 'timeout') {
    signal('SIGKILL');
    await exited;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let server = null;
  let base = args.url;
  if (!base) {
    if (args.build) await runNext(['build']);
    server = spawn(process.execPath, [nextBin, 'start', '-p', String(args.port)], {
      cwd: appDir,
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    // 예기치 않은 크래시로 finally를 못 타도 서버를 남기지 않는다(exit 핸들러는 동기만 가능).
    const orphan = server;
    process.on('exit', () => {
      if (orphan.exitCode === null) {
        try {
          if (process.platform !== 'win32') process.kill(-orphan.pid, 'SIGKILL');
          else orphan.kill('SIGKILL');
        } catch {
          // 이미 종료됨
        }
      }
    });
    base = `http://localhost:${args.port}`;
  }
  const outDir = args.out ?? join(tmpdir(), `galley-verify-layout-${Date.now()}`);
  mkdirSync(outDir, { recursive: true });

  const results = [];
  try {
    await waitFor(() => fetch(`${base}/design`).then((r) => r.ok), {
      tries: 120,
      label: `${base}/design`,
    });
    const browser = await launchChrome();
    try {
      for (const verify of [verifyShellScroll, verifySelect, verifyMenu, verifySplitPane]) {
        const page = await browser.openPage(`${base}/design`);
        try {
          await page.waitForReady();
          results.push(await verify(page, { outDir }));
        } catch (error) {
          results.push({
            name: verify.name,
            checks: [{ label: `실행 오류: ${error.message}`, pass: false }],
          });
        } finally {
          page.close();
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    if (server) await killTree(server);
  }

  let passed = 0;
  let total = 0;
  for (const result of results) {
    console.log(`\n## ${result.name}`);
    for (const check of result.checks) {
      total += 1;
      if (check.pass) passed += 1;
      console.log(`${check.pass ? 'PASS' : 'FAIL'}  ${check.label}`);
    }
  }
  console.log(`\n${passed}/${total} PASS · 스크린샷: ${outDir}`);
  process.exitCode = passed === total && total > 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
