// 본문 삽화 렌더러 — 모델이 쓴 1200×520 SVG 조각을 소프트 UI v2 PNG로(blog 폴더 `tools/make_illust.py` v2의 페이지를 옮김).
// 배경(연한 복숭아 그라데이션)·글꼴·공용 defs(그림자 필터·화살표 마커)는 페이지가 입힌다 — SVG에는 배경 rect를 두지 않는다.
// SVG는 모델이 쓴 글이라 **렌더 직전에 항상 거른다**(markup.ts) + 페이지 CSP로 한 겹 더(썸네일 그림과 같은 두 겹).
// 찍는 길은 썸네일과 같은 설치된 Chrome headless(decisions/illustrations.md — Playwright·글꼴 다운로드 없음).
import { sanitizeMarkup } from './markup.ts';
import {
  resolveChromePath,
  screenshotHtml,
  THUMBNAIL_TIMEOUT_MS,
  type ThumbnailCheckResult,
  type ThumbnailRenderResult,
} from './thumbnail.ts';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const ILLUSTRATION_WIDTH = 1200;
export const ILLUSTRATION_HEIGHT = 520;
/** 배율 2 — 원본 스크립트의 device_scale_factor=2(실제 PNG는 2400×1040). */
export const ILLUSTRATION_SCALE = 2;

/** 공용 defs — SVG 안에서 `filter="url(#soft)"`·`url(#softSm)`, `marker-end="url(#arr)"`·`url(#arrRed)`로 쓴다(make_illust.py DEFS 그대로). */
const ILLUSTRATION_DEFS = `<svg width="0" height="0" style="position:absolute"><defs>
<filter id="soft" x="-20%" y="-20%" width="140%" height="150%">
  <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#BE6450" flood-opacity="0.16"/>
  <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.04"/>
</filter>
<filter id="softSm" x="-20%" y="-30%" width="140%" height="170%">
  <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#BE6450" flood-opacity="0.14"/>
</filter>
<marker id="arr" viewBox="0 0 10 10" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#C9CDD4"/></marker>
<marker id="arrRed" viewBox="0 0 10 10" markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#EC3B24"/></marker>
</defs></svg>`;

/** make_illust.py PAGE의 CSS(값 그대로) — 글꼴은 시스템 설치 전제, 없으면 뒤의 대체 글꼴. 일본어판은 같은 목록의 JP 글꼴로 떨어진다. */
const ILLUSTRATION_CSS = `body{margin:0}
.wrap{width:${ILLUSTRATION_WIDTH}px;height:${ILLUSTRATION_HEIGHT}px;position:relative;overflow:hidden;font-family:'Noto Sans KR','Noto Sans CJK KR','Noto Sans JP','Apple SD Gothic Neo','Hiragino Sans','Malgun Gothic','Yu Gothic',sans-serif;color:#15171A;
 background:radial-gradient(circle at 94% 10%, #FFD9CE 0, rgba(255,217,206,0) 340px),
 radial-gradient(circle at 6% 110%, #FFE6C2 0, rgba(255,230,194,0) 320px), #FFF6F0}
.wrap svg text{font-family:'Noto Sans KR','Noto Sans CJK KR','Noto Sans JP','Apple SD Gothic Neo','Hiragino Sans','Malgun Gothic','Yu Gothic',sans-serif}
.wrap svg text[font-family="monospace"], .wrap svg g[font-family="monospace"] text{font-family:'IBM Plex Mono',ui-monospace,Menlo,Consolas,'Noto Sans KR',monospace}`;

/** 스크립트는 하나도 없다 — 인라인 스타일만 허용하고 나머지(네트워크·파일·이미지·글꼴 로드·스크립트)는 전부 금지. */
const ILLUSTRATION_CSP = `default-src 'none'; style-src 'unsafe-inline'`;

/**
 * 모델 SVG → 저장·렌더용 SVG. 걸러서(sanitizeMarkup) 첫 `<svg …>`부터 마지막 `</svg>`까지만 남긴다(앞뒤 설명 글자 제거).
 * svg 요소가 없으면 undefined — 그릴 게 없다.
 */
export function cleanIllustrationSvg(raw: string): string | undefined {
  const clean = sanitizeMarkup(raw);
  const start = clean.indexOf('<svg');
  const end = clean.lastIndexOf('</svg>');
  if (start === -1 || end < start) return undefined;
  const svg = clean.slice(start, end + '</svg>'.length);
  // 따로 저장한 .svg가 뷰어에서 열리게 네임스페이스를 보장한다(모델이 빼먹거나 다른 값을 써서 걸러진 경우).
  return /^<svg[^>]*\sxmlns="/.test(svg)
    ? svg
    : svg.replace(/^<svg/, `<svg xmlns="${SVG_NAMESPACE}"`);
}

/** 삽화 페이지 — 배경·글꼴·공용 defs + 거른 SVG. `lang`은 글꼴 선택용(ko·ja). SVG가 비면 배경만 찍힌다. */
export function renderIllustrationHtml(svg: string, lang: 'ko' | 'ja' = 'ko'): string {
  const clean = cleanIllustrationSvg(svg) ?? '';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${ILLUSTRATION_CSP}"><style>${ILLUSTRATION_CSS}</style></head><body><div class="wrap">${ILLUSTRATION_DEFS}${clean}</div></body></html>`;
}

export interface IllustrationRenderer {
  /** 찍을 수 있는 상태인지(실행 파일 존재) — 단계가 모델을 부르기 전에 물어 토큰을 아낀다(썸네일과 같은 규칙). */
  check(): Promise<ThumbnailCheckResult>;
  render(svg: string, lang: 'ko' | 'ja', signal?: AbortSignal): Promise<ThumbnailRenderResult>;
}

export interface ChromeIllustrationRendererOptions {
  chromePath?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export class ChromeIllustrationRenderer implements IllustrationRenderer {
  private readonly options: ChromeIllustrationRendererOptions;

  constructor(options: ChromeIllustrationRendererOptions = {}) {
    this.options = options;
  }

  async check(): Promise<ThumbnailCheckResult> {
    return resolveChromePath(this.options) === undefined
      ? { ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' }
      : { ok: true };
  }

  async render(
    svg: string,
    lang: 'ko' | 'ja',
    signal?: AbortSignal,
  ): Promise<ThumbnailRenderResult> {
    const chrome = resolveChromePath(this.options);
    if (chrome === undefined) return { ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' };
    return screenshotHtml(
      chrome,
      renderIllustrationHtml(svg, lang),
      { width: ILLUSTRATION_WIDTH, height: ILLUSTRATION_HEIGHT, scale: ILLUSTRATION_SCALE },
      this.options.timeoutMs ?? THUMBNAIL_TIMEOUT_MS,
      signal,
    );
  }
}
