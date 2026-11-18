// 썸네일 렌더러 — 1200×630 소프트 UI v2 PNG(blog 폴더 `tools/make_thumb.py` v2의 HTML 템플릿을 옮김, 로고·상표 없음).
// 왼쪽: 태그 알약·제목(마지막 줄 강조색)·부제·시리즈 배지·브랜드. 오른쪽 580×630은 그림 자리(decisions/illustrations.md).
// 인터페이스(`ThumbnailRenderer`) 뒤에 구현을 두어 교체 가능하게 한다(decisions/deploy-readiness.md). 첫 구현은 **설치된
// Chrome headless `--screenshot`**(2026-09-26 사용자 결정 — Python+Playwright 대신, 새 라이브러리 없음). Chrome 경로는
// verify:layout과 같은 규칙: `GALLEY_CHROME` 우선, 없으면 OS별 후보(decisions/layout-measurement.md). 실패는 값으로.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const THUMBNAIL_WIDTH = 1200;
export const THUMBNAIL_HEIGHT = 630;
/** 배율 2 — 원본 스크립트의 device_scale_factor=2(실제 PNG는 2400×1260). */
export const THUMBNAIL_SCALE = 2;

/** 제목 줄 수 상한 — 마지막 줄이 강조색. */
export const THUMBNAIL_TITLE_MAX_LINES = 3;
/** 태그 알약 수 상한. */
export const THUMBNAIL_TAGS_MAX = 3;
/** 시리즈 배지의 편 점 — 이보다 편이 많으면 점은 빼고 "EP 03 / 20"만. */
export const THUMBNAIL_SERIES_DOTS_MAX = 12;

export interface ThumbnailSeries {
  name: string;
  episodeNo: number;
  total: number;
}

export interface ThumbnailInput {
  /** 제목 줄(1~3줄, 넘치면 앞 3줄). 마지막 줄이 강조색. 한 줄이 길면 글자 크기가 줄어든다(70→44px). */
  titleLines: readonly string[];
  /** 부제 — 비면 자리를 만들지 않는다. 두 줄까지 자동 줄바꿈. */
  subtitle: string;
  /** 색 점 알약(최대 3개). 기술 이름은 원어 표기, 로고 없음. */
  tags: readonly string[];
  /** 왼쪽 아래 브랜드 표기(블로그 이름) — 비면 생략. */
  brand: string;
  /** 시리즈 글이면 "시리즈명 ●●●▬ EP 01 / 06" 배지. */
  series?: ThumbnailSeries;
}

export type ThumbnailRenderResult =
  | { ok: true; png: Uint8Array }
  /** 실행 파일을 못 찾음 — GALLEY_CHROME으로 지정해야 한다(재시도 불가). */
  | { ok: false; code: 'THUMBNAIL_CHROME_NOT_FOUND' }
  /** 제한 시간 안에 끝나지 않음(재시도 가능). */
  | { ok: false; code: 'THUMBNAIL_RENDER_TIMEOUT'; detail: string }
  /** 종료 코드·출력 파일 없음·파일 I/O 실패(재시도 불가). */
  | { ok: false; code: 'THUMBNAIL_RENDER_FAILED'; detail: string };

export type ThumbnailCheckResult = { ok: true } | { ok: false; code: 'THUMBNAIL_CHROME_NOT_FOUND' };

export interface ThumbnailRenderer {
  /** 찍을 수 있는 상태인지(실행 파일 존재) — 단계가 **모델을 부르기 전에** 물어 토큰을 아낀다(리뷰 M4, 사용자 결정). */
  check(): Promise<ThumbnailCheckResult>;
  render(input: ThumbnailInput, signal?: AbortSignal): Promise<ThumbnailRenderResult>;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 제목 한 줄 권장 길이(공백 포함) — 70px로 560px 안에 들어가는 폭. */
export const THUMBNAIL_TITLE_LINE_CHARS = 9;
/** 한 줄 상한 — 44px까지 줄여도 이보다 길면 틀을 넘는다. */
export const THUMBNAIL_TITLE_LINE_MAX_CHARS = 13;

/**
 * 제목 → 썸네일 줄(1~3). 모델이 줄 나누기를 못 줬을 때의 기본값: 끝의 괄호 부제는 떼고, 낱말 단위로 한 줄 9자 안팎에 채운다.
 * 3줄을 넘는 나머지는 마지막 줄에 붙인다(글자 크기 축소가 받는다). 낱말 하나가 길면 그 줄만 길어진다 — 낱말은 자르지 않는다.
 */
export function splitThumbnailTitle(title: string): string[] {
  const bare = title.replace(/\s*[((][^()()]*[))]\s*$/, '').trim();
  const words = (bare === '' ? title.trim() : bare).split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last === undefined) {
      lines.push(word);
    } else if (
      Array.from(`${last} ${word}`).length <= THUMBNAIL_TITLE_LINE_CHARS ||
      lines.length === THUMBNAIL_TITLE_MAX_LINES
    ) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

/** 알약 색(배경, 글자) — make_thumb.py TAG_COLORS. 태그 순서대로 돌려 쓴다. */
const TAG_COLORS: readonly (readonly [string, string])[] = [
  ['#E8F1FF', '#2563EB'],
  ['#F1EBFF', '#6D4AE0'],
  ['#FFE9E6', '#E2402B'],
];

/** make_thumb.py v2 CSS에서 왼쪽 틀에 쓰는 부분(색·여백·글꼴 값 그대로). 글꼴은 시스템 설치 전제 — 없으면 뒤의 대체 글꼴. */
const THUMBNAIL_CSS = `*{box-sizing:border-box} body{margin:0}
.c{width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px;position:relative;overflow:hidden;font-family:'Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#15171A;
 background:radial-gradient(circle at 92% 18%, #FFD3C7 0, rgba(255,211,199,0) 380px),
 radial-gradient(circle at 18% 105%, #FFE3B8 0, rgba(255,227,184,0) 360px),
 radial-gradient(circle at 70% 120%, #F6D8E8 0, rgba(246,216,232,0) 420px), #FFF6F0}
.left{position:absolute;left:64px;top:58px;width:560px;height:520px;display:flex;flex-direction:column}
.tags{display:flex;gap:12px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:10px;padding:10px 20px;border-radius:999px;font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:500;font-size:20px}
.pill i{width:10px;height:10px;border-radius:50%}
h1{margin:48px 0 0;font-weight:900;font-size:70px;line-height:1.18;letter-spacing:-0.035em;white-space:nowrap}
h1 em{font-style:normal;color:#EC3B24}
.sub{margin:24px 0 0;font-size:25px;font-weight:400;line-height:1.5;color:#5A5F68;word-break:keep-all}
.foot{margin-top:auto;display:flex;flex-direction:column;gap:14px}
.brand{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:500;font-size:22px;color:#3A3E45}
.series{display:inline-flex;align-self:flex-start;align-items:center;gap:16px;padding:12px 20px;border-radius:16px;background:rgba(255,255,255,.75);box-shadow:0 6px 20px rgba(190,110,90,.14)}
.sname{font-size:20px;font-weight:700}
.dots{display:flex;gap:6px} .dots i{width:10px;height:10px;border-radius:50%;background:#E9DCD6}
.dots i.done{background:#F2A496} .dots i.on{background:#EC3B24;width:26px;border-radius:5px}
.ep{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,monospace;font-weight:500;font-size:20px;color:#EC3B24} .ep small{font-size:16px;color:#8A8F98}
.art{position:absolute;left:620px;top:0;width:580px;height:630px}`;

/** 제목이 왼쪽 틀(560px)을 넘으면 44px까지 줄인다 — make_thumb.py FIT. 스크린샷 전에 동기로 돈다. */
const THUMBNAIL_FIT_SCRIPT = `<script>
const h=document.querySelector('h1');let s=70;
while(h&&h.scrollWidth>560&&s>44){s-=2;h.style.fontSize=s+'px';}
</script>`;

const pad2 = (n: number): string => String(n).padStart(2, '0');

function renderSeriesBadge(series: ThumbnailSeries): string {
  const dots =
    series.total > THUMBNAIL_SERIES_DOTS_MAX
      ? ''
      : `<span class="dots">${Array.from({ length: series.total }, (_, i) => {
          const n = i + 1;
          const cls = n === series.episodeNo ? 'on' : n < series.episodeNo ? 'done' : '';
          return `<i class="${cls}"></i>`;
        }).join('')}</span>`;
  return `<div class="series"><span class="sname">${escapeHtml(series.name)}</span>${dots}<span class="ep">EP ${pad2(series.episodeNo)}<small> / ${pad2(series.total)}</small></span></div>`;
}

/** 템플릿 — make_thumb.py v2와 같은 구조·값. 글자는 전부 HTML 이스케이프해 넣는다(스크립트는 안 했다). 빈 줄·빈 태그는 뺀다. */
export function renderThumbnailHtml(input: ThumbnailInput): string {
  const lines = input.titleLines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, THUMBNAIL_TITLE_MAX_LINES)
    .map(escapeHtml);
  const title = lines
    .map((line, i) => (i === lines.length - 1 ? `<em>${line}</em>` : line))
    .join('<br>');
  const tags = input.tags
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
    .slice(0, THUMBNAIL_TAGS_MAX)
    .map((tag, i) => {
      const [bg, fg] = TAG_COLORS[i % TAG_COLORS.length]!;
      return `<span class="pill" style="background:${bg};color:${fg}"><i style="background:${fg}"></i>${escapeHtml(tag)}</span>`;
    })
    .join('');
  const subtitle = input.subtitle.trim();
  const sub = subtitle === '' ? '' : `<p class="sub">${escapeHtml(subtitle)}</p>`;
  const brand = input.brand.trim();
  const foot =
    (input.series === undefined ? '' : renderSeriesBadge(input.series)) +
    (brand === '' ? '' : `<div class="brand">${escapeHtml(brand)}</div>`);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${THUMBNAIL_CSS}</style></head><body><div class="c"><div class="left"><div class="tags">${tags}</div><h1>${title}</h1>${sub}<div class="foot">${foot}</div></div><div class="art"></div></div>${THUMBNAIL_FIT_SCRIPT}</body></html>`;
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

  /** 실행 파일 — 옵션 → GALLEY_CHROME/후보. 지정된 경로가 없는 파일이면(오타) 못 찾은 것으로 본다(리뷰 M3). */
  private resolveChrome(): string | undefined {
    const chrome = this.options.chromePath ?? findChrome(this.options.env);
    if (chrome === undefined) return undefined;
    // 절대경로인데 없으면 오타 — PATH 이름(linux 후보)은 spawn이 판정한다.
    if (isAbsolute(chrome) && !existsSync(chrome)) return undefined;
    return chrome;
  }

  async check(): Promise<ThumbnailCheckResult> {
    return this.resolveChrome() === undefined
      ? { ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' }
      : { ok: true };
  }

  async render(input: ThumbnailInput, signal?: AbortSignal): Promise<ThumbnailRenderResult> {
    const chrome = this.resolveChrome();
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
          pathToFileURL(html).href,
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
      // 정리 실패(SIGKILL 직후 헬퍼 프로세스가 프로필에 쓰는 경합)는 결과를 바꾸지 않는다 — 값으로 끝난 결과를 예외로 덮지 않는다(리뷰 M2).
      await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    }
  }
}

type ChromeRun =
  | { ok: true; png: Uint8Array }
  | { ok: false; code: 'THUMBNAIL_CHROME_NOT_FOUND' }
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
    // 이미 중단된 신호는 abort 이벤트가 다시 오지 않는다 — spawn 전에 본다(리뷰 M1).
    if (signal?.aborted) {
      resolve({ ok: false, code: 'THUMBNAIL_RENDER_FAILED', detail: '중단됨' });
      return;
    }
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
      // PATH 이름 후보(linux)가 없으면 여기로 온다 — "실행 실패"가 아니라 "못 찾음"으로 안내(리뷰 M3).
      const code = (error as NodeJS.ErrnoException).code;
      finish(
        code === 'ENOENT'
          ? { ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' }
          : { ok: false, code: 'THUMBNAIL_RENDER_FAILED', detail: error.message },
      );
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

// ── 템플릿 설정(브랜드 표기) ─────────────────────────────────────────────────

/** `.galley/thumbnail.json` — 브랜드 표기(블로그 이름)는 개인 값이라 코드에 두지 않는다. 없으면 브랜드 줄 없음. */
export interface ThumbnailConfig {
  brand: string;
}

export const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = { brand: '' };

export type ThumbnailConfigResult =
  | { ok: true; config: ThumbnailConfig }
  | { ok: false; code: 'THUMBNAIL_CONFIG_MISSING' }
  | { ok: false; code: 'THUMBNAIL_CONFIG_UNREADABLE' }
  | { ok: false; code: 'THUMBNAIL_CONFIG_INVALID' };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * JSON → 설정. `brand`는 선택(빠지면 빈 값), 있으면 문자열이어야 한다. `brand`가 없고 예전 키 `footerLeft`(v1 푸터 왼쪽 = 블로그
 * 이름)가 있으면 그것을 쓴다 — 이미 있는 설정 파일을 손으로 고치지 않게. 그 밖의 키(v1의 footerRight·defaultTag 포함)는 무시.
 */
export function parseThumbnailConfig(json: unknown): ThumbnailConfigResult {
  if (!isRecord(json)) return { ok: false, code: 'THUMBNAIL_CONFIG_INVALID' };
  const value = json['brand'] ?? json['footerLeft'];
  if (value === undefined) return { ok: true, config: { ...DEFAULT_THUMBNAIL_CONFIG } };
  if (typeof value !== 'string') return { ok: false, code: 'THUMBNAIL_CONFIG_INVALID' };
  return { ok: true, config: { brand: value } };
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
