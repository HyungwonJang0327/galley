// 썸네일 렌더러 — 1200×630 텍스트 전용 PNG(blog 폴더 `tools/make_thumb.py`의 HTML 템플릿을 그대로 옮김, 로고·상표 없음).
// 인터페이스(`ThumbnailRenderer`) 뒤에 구현을 두어 교체 가능하게 한다(decisions/deploy-readiness.md). 첫 구현은 **설치된
// Chrome headless `--screenshot`**(2026-09-26 사용자 결정 — Python+Playwright 대신, 새 라이브러리 없음). Chrome 경로는
// verify:layout과 같은 규칙: `GALLEY_CHROME` 우선, 없으면 OS별 후보(decisions/layout-measurement.md). 실패는 값으로.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const THUMBNAIL_WIDTH = 1200;
export const THUMBNAIL_HEIGHT = 630;
/** 배율 2 — 원본 스크립트의 device_scale_factor=2(실제 PNG는 2400×1260). */
export const THUMBNAIL_SCALE = 2;

export interface ThumbnailInput {
  title: string;
  subtitle: string;
  /** 상단 작은 라벨(예 TROUBLESHOOTING). */
  tag: string;
  footerLeft: string;
  footerRight: string;
}

export type ThumbnailRenderResult =
  | { ok: true; png: Uint8Array }
  /** 실행 파일을 못 찾음 — GALLEY_CHROME으로 지정해야 한다(재시도 불가). */
  | { ok: false; code: 'THUMBNAIL_CHROME_NOT_FOUND' }
  /** 제한 시간 안에 끝나지 않음(재시도 가능). */
  | { ok: false; code: 'THUMBNAIL_RENDER_TIMEOUT'; detail: string }
  /** 종료 코드·출력 파일 없음·파일 I/O 실패(재시도 불가). */
  | { ok: false; code: 'THUMBNAIL_RENDER_FAILED'; detail: string };

export interface ThumbnailRenderer {
  render(input: ThumbnailInput, signal?: AbortSignal): Promise<ThumbnailRenderResult>;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 템플릿 — make_thumb.py와 글자 단위로 같다(색·여백·글꼴). 값은 HTML 이스케이프해 넣는다(스크립트는 안 했다). */
export function renderThumbnailHtml(input: ThumbnailInput): string {
  const v = {
    title: escapeHtml(input.title),
    sub: escapeHtml(input.subtitle),
    tag: escapeHtml(input.tag),
    fl: escapeHtml(input.footerLeft),
    fr: escapeHtml(input.footerRight),
  };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px;background:#182233;font-family:'Noto Sans CJK KR','Noto Sans CJK JP',sans-serif;color:#f2f3f5;overflow:hidden}
.wrap{position:relative;width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px;box-sizing:border-box;padding:72px 84px;display:flex;flex-direction:column;justify-content:space-between}
.tag{font-size:22px;letter-spacing:.14em;color:#8ec5ff;font-weight:600}
h1{font-size:64px;line-height:1.22;margin:0;font-weight:800;letter-spacing:-.01em;word-break:keep-all;max-width:960px}
.sub{font-size:28px;color:#b7c3d6;margin-top:22px;font-weight:400;word-break:keep-all}
.foot{display:flex;justify-content:space-between;align-items:flex-end;font-size:22px;color:#7f8ca3}
.bar{position:absolute;left:0;top:0;width:12px;height:${THUMBNAIL_HEIGHT}px;background:linear-gradient(#8ec5ff,#3d7fd6)}
.grid{position:absolute;right:-60px;bottom:-60px;width:420px;height:420px;background-image:radial-gradient(#2b3a55 2px,transparent 2px);background-size:26px 26px;opacity:.7;border-radius:50%}
</style></head><body><div class="wrap"><div class="bar"></div><div class="grid"></div>
<div><div class="tag">${v.tag}</div><h1 style="margin-top:28px">${v.title}</h1><div class="sub">${v.sub}</div></div>
<div class="foot"><span>${v.fl}</span><span>${v.fr}</span></div>
</div></body></html>`;
}

/** OS별 Chrome 후보 — apps/dashboard/scripts/verify-layout/cdp.mjs와 같은 표(그 파일은 대시보드 스크립트라 import하지 않는다). */
const CHROME_CANDIDATES: Partial<Record<NodeJS.Platform, readonly string[]>> = {
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

const onPath = (name: string, path: string | undefined): string | undefined => {
  for (const dir of (path ?? '').split(delimiter)) {
    if (dir === '') continue;
    const full = join(dir, name);
    if (existsSync(full)) return full;
  }
  return undefined;
};

/** Chrome 실행 파일 — `GALLEY_CHROME` 우선(있으면 존재 여부와 무관하게 그대로 — 실행에서 실패한다), 없으면 후보 탐색. 못 찾으면 undefined. */
export function findChrome(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromEnv = env['GALLEY_CHROME'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv;
  for (const candidate of CHROME_CANDIDATES[process.platform] ?? []) {
    const found = isAbsolute(candidate)
      ? existsSync(candidate)
        ? candidate
        : undefined
      : onPath(candidate, env['PATH']);
    if (found !== undefined) return found;
  }
  return undefined;
}

export interface ChromeThumbnailRendererOptions {
  /** 실행 파일. 없으면 render마다 findChrome — 기동 뒤 설치해도 다음 단계에서 잡힌다. */
  chromePath?: string;
  /** 한 장 렌더 제한 시간. Chrome 첫 기동이 느린 머신을 감안해 넉넉히. */
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export const THUMBNAIL_TIMEOUT_MS = 60_000;

/**
 * headless Chrome으로 HTML 한 장을 찍는다. 임시 폴더에 html·프로필·출력을 두고 끝나면 지운다. `--screenshot`은 창 크기(CSS px)로
 * 찍으므로 1200×630 + 배율 2. 종료 신호가 오면 프로세스를 죽이고 실패(값)로 끝낸다 — 호출부(단계)가 aborted를 보고 중단으로 다룬다.
 */
export class ChromeThumbnailRenderer implements ThumbnailRenderer {
  private readonly options: ChromeThumbnailRendererOptions;

  constructor(options: ChromeThumbnailRendererOptions = {}) {
    this.options = options;
  }

  async render(input: ThumbnailInput, signal?: AbortSignal): Promise<ThumbnailRenderResult> {
    const chrome = this.options.chromePath ?? findChrome(this.options.env);
    if (chrome === undefined) return { ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' };
    const timeoutMs = this.options.timeoutMs ?? THUMBNAIL_TIMEOUT_MS;

    const dir = await mkdtemp(join(tmpdir(), 'galley-thumb-'));
    const html = join(dir, 'thumb.html');
    const out = join(dir, 'thumb.png');
    try {
      await writeFile(html, renderThumbnailHtml(input), 'utf8');
      return await runChrome(
        chrome,
        [
          '--headless=new',
          `--screenshot=${out}`,
          `--window-size=${THUMBNAIL_WIDTH},${THUMBNAIL_HEIGHT}`,
          `--force-device-scale-factor=${THUMBNAIL_SCALE}`,
          '--hide-scrollbars',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-gpu',
          `--user-data-dir=${join(dir, 'profile')}`,
          `file://${html}`,
        ],
        out,
        timeoutMs,
        signal,
      );
    } catch (error) {
      return {
        ok: false,
        code: 'THUMBNAIL_RENDER_FAILED',
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}

type ChromeRun =
  | { ok: true; png: Uint8Array }
  | { ok: false; code: 'THUMBNAIL_RENDER_TIMEOUT' | 'THUMBNAIL_RENDER_FAILED'; detail: string };

/** PNG 끝 청크 — 파일이 다 써졌는지의 기준(rename이 아니라 제자리 쓰기라 크기만으로는 모른다). */
const PNG_IEND = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const POLL_MS = 100;

const isCompletePng = (bytes: Uint8Array): boolean =>
  bytes.length > 8 && PNG_IEND.every((b, i) => bytes[bytes.length - 8 + i] === b);

/**
 * Chrome을 띄우고 **출력 파일이 완성되면** 읽고 프로세스를 죽인다 — 종료를 기다리지 않는다. macOS Chrome headless는 스크린샷을
 * 쓴 뒤에도 업데이터 등으로 프로세스가 오래 남는다(실측 60초 넘게). 파일이 생기기 전에 프로세스가 끝나면 실패.
 */
function runChrome(
  chrome: string,
  args: string[],
  out: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ChromeRun> {
  return new Promise((resolve) => {
    let settled = false;
    let stderr = '';
    let exited = false;
    let child: ReturnType<typeof spawn>;
    const stop = () => {
      clearTimeout(timer);
      clearInterval(poll);
      signal?.removeEventListener('abort', onAbort);
      if (!exited) child.kill('SIGKILL');
    };
    const finish = (result: ChromeRun) => {
      if (settled) return;
      settled = true;
      stop();
      resolve(result);
    };
    const onAbort = () => finish({ ok: false, code: 'THUMBNAIL_RENDER_FAILED', detail: '중단됨' });
    try {
      child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
      resolve({
        ok: false,
        code: 'THUMBNAIL_RENDER_FAILED',
        detail: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          code: 'THUMBNAIL_RENDER_TIMEOUT',
          detail: `${timeoutMs}ms 안에 끝나지 않았다`,
        }),
      timeoutMs,
    );
    let reading = false;
    const poll = setInterval(() => {
      if (reading || settled) return;
      reading = true;
      readFile(out)
        .then((bytes) => {
          if (isCompletePng(bytes)) finish({ ok: true, png: new Uint8Array(bytes) });
        })
        .catch(() => {
          /* 아직 없음 */
        })
        .finally(() => {
          reading = false;
        });
    }, POLL_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      exited = true;
      finish({ ok: false, code: 'THUMBNAIL_RENDER_FAILED', detail: error.message });
    });
    child.on('exit', (code) => {
      exited = true;
      // 끝났으면 마지막으로 한 번 더 본다 — 파일이 있으면 성공, 없으면 종료 코드로 실패.
      readFile(out)
        .then((bytes) => {
          if (isCompletePng(bytes)) finish({ ok: true, png: new Uint8Array(bytes) });
          else throw new Error('incomplete');
        })
        .catch(() =>
          finish({
            ok: false,
            code: 'THUMBNAIL_RENDER_FAILED',
            detail: `Chrome이 출력 없이 끝났다(종료 코드 ${String(code)}): ${stderr.trim().slice(-300)}`,
          }),
        );
    });
  });
}

// ── 템플릿 설정(푸터·기본 태그) ──────────────────────────────────────────────

/** `.galley/thumbnail.json` — 푸터 좌/우는 개인 표기(블로그 이름·핸들)라 코드에 두지 않는다. 없으면 빈 푸터. */
export interface ThumbnailConfig {
  footerLeft: string;
  footerRight: string;
  /** 모델이 태그를 못 주거나 비웠을 때. */
  defaultTag: string;
}

export const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = {
  footerLeft: '',
  footerRight: '',
  defaultTag: 'TROUBLESHOOTING',
};

export type ThumbnailConfigResult =
  | { ok: true; config: ThumbnailConfig }
  | { ok: false; code: 'THUMBNAIL_CONFIG_MISSING' }
  | { ok: false; code: 'THUMBNAIL_CONFIG_UNREADABLE' }
  | { ok: false; code: 'THUMBNAIL_CONFIG_INVALID' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON → 설정. 세 키 모두 선택(빠지면 기본값), 있으면 문자열이어야 한다. 모르는 키는 무시. */
export function parseThumbnailConfig(json: unknown): ThumbnailConfigResult {
  if (!isRecord(json)) return { ok: false, code: 'THUMBNAIL_CONFIG_INVALID' };
  const config = { ...DEFAULT_THUMBNAIL_CONFIG };
  for (const key of ['footerLeft', 'footerRight', 'defaultTag'] as const) {
    const value = json[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') return { ok: false, code: 'THUMBNAIL_CONFIG_INVALID' };
    config[key] = value;
  }
  return { ok: true, config };
}

export async function loadThumbnailConfig(path: string): Promise<ThumbnailConfigResult> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    const code = isRecord(error) ? error['code'] : undefined;
    return {
      ok: false,
      code: code === 'ENOENT' ? 'THUMBNAIL_CONFIG_MISSING' : 'THUMBNAIL_CONFIG_UNREADABLE',
    };
  }
  try {
    return parseThumbnailConfig(JSON.parse(raw));
  } catch {
    return { ok: false, code: 'THUMBNAIL_CONFIG_INVALID' };
  }
}

/**
 * 기본 경로 — `.env`의 `THUMBNAIL_CONFIG_PATH`가 있으면 그것, 없으면 리포 루트 `.galley/thumbnail.json`(redact와 같은 규칙,
 * 문자열 경로 계산만 — 번들러가 정적 자산으로 해석하지 않게).
 */
export function defaultThumbnailConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env['THUMBNAIL_CONFIG_PATH'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv;
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..', '.galley', 'thumbnail.json');
}
