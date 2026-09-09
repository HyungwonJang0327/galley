// headless Chrome 실행 + CDP(WebSocket) 연결 공통. 외부 의존성 없음(Node 20은 --experimental-websocket).
// Chrome 실행 파일: GALLEY_CHROME 환경 변수 우선, 없으면 OS별 기본 후보 탐색 (decisions/layout-measurement.md).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** fn이 truthy를 돌려줄 때까지 폴링한다. 준비 전 예외는 무시. */
export async function waitFor(fn, { tries = 60, interval = 250, label = 'waitFor' } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      // 아직 준비되지 않음 — 다음 시도
    }
    await sleep(interval);
  }
  throw new Error(`timeout: ${label}`);
}

const CHROME_CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  win32: [
    join(
      process.env.PROGRAMFILES ?? 'C:\\Program Files',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ),
    join(
      process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ),
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ],
};

const onPath = (name) =>
  (process.env.PATH ?? '').split(delimiter).some((dir) => dir && existsSync(join(dir, name)));

export function findChrome() {
  if (process.env.GALLEY_CHROME) return process.env.GALLEY_CHROME;
  const found = (CHROME_CANDIDATES[process.platform] ?? []).find((candidate) =>
    isAbsolute(candidate) ? existsSync(candidate) : onPath(candidate),
  );
  if (!found) {
    throw new Error('Chrome을 찾지 못했습니다. GALLEY_CHROME=<실행 파일 경로>로 지정하세요.');
  }
  return found;
}

/** headless Chrome을 띄우고 { openPage, close }를 돌려준다. */
export async function launchChrome({ windowSize = '1400,900' } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'galley-cdp-'));
  const chromePath = findChrome();
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      // 포트 0 → Chrome이 프로필 폴더의 DevToolsActivePort에 실제 포트를 쓴다(충돌 없음).
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${windowSize}`,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  // 실행 파일이 없거나(ENOENT) 바로 죽으면 대기 대신 즉시 실패시킨다.
  const died = new Promise((_, reject) => {
    chrome.once('error', (error) =>
      reject(new Error(`Chrome 실행 실패(${chromePath}): ${error.message}`)),
    );
    chrome.once('exit', (code) => reject(new Error(`Chrome이 먼저 종료됨(exit ${code})`)));
  });
  died.catch(() => {
    // race 밖에서는 무시(정상 close 시에도 exit가 난다)
  });

  const close = async () => {
    if (chrome.exitCode === null) {
      await new Promise((resolve) => {
        chrome.once('exit', resolve);
        chrome.kill();
      });
    }
    rmSync(profile, { recursive: true, force: true });
  };

  try {
    const port = await Promise.race([
      waitFor(
        () => {
          const file = join(profile, 'DevToolsActivePort');
          return existsSync(file) ? Number(readFileSync(file, 'utf8').split('\n')[0]) : 0;
        },
        { label: 'DevToolsActivePort' },
      ),
      died,
    ]);
    const origin = `http://127.0.0.1:${port}`;
    await Promise.race([
      waitFor(() => fetch(`${origin}/json/version`).then((r) => r.ok), { label: 'CDP ready' }),
      died,
    ]);
    return { openPage: (url) => openPage(origin, url), close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function openPage(origin, url) {
  const target = await fetch(`${origin}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error(`CDP 연결 실패: ${target.webSocketDebuggerUrl}`));
  });

  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');

  const page = {
    url,
    /** 페이지 컨텍스트에서 식(또는 async IIFE)을 평가해 값을 돌려준다. */
    async evaluate(expression) {
      const message = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      const details = message.result?.exceptionDetails;
      if (details) {
        throw new Error(details.exception?.description ?? JSON.stringify(details));
      }
      return message.result?.result?.value;
    },
    /** 문서 로드 + selector 존재까지 대기, 이후 폰트·하이드레이션 안정화 시간. */
    async waitForReady(selector = 'main') {
      await waitFor(
        () =>
          page.evaluate(
            `document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`,
          ),
        { label: `page ready (${url})` },
      );
      await sleep(500);
    },
    async screenshot(file) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
    },
    close() {
      ws.close();
    },
  };
  return page;
}
