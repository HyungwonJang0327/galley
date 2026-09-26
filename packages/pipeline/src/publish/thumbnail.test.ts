// 템플릿·설정은 순수 테스트, 실제 렌더는 설치된 Chrome이 있을 때만(없으면 건너뜀 — CI 러너는 google-chrome이 있다).
import { describe, test, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ChromeThumbnailRenderer,
  DEFAULT_THUMBNAIL_CONFIG,
  defaultThumbnailConfigPath,
  findChrome,
  loadThumbnailConfig,
  parseThumbnailConfig,
  renderThumbnailHtml,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_SCALE,
  THUMBNAIL_WIDTH,
  type ThumbnailInput,
} from './thumbnail.ts';

const INPUT: ThumbnailInput = {
  title: '무한 스크롤 <미리> 불러오기',
  subtitle: '피드 끝에 닿기 전에 & 다음 페이지',
  tag: 'TROUBLESHOOTING',
  footerLeft: 'Left',
  footerRight: 'right.example',
};

describe('renderThumbnailHtml', () => {
  test('값을 HTML 이스케이프해 템플릿 자리에 넣는다', () => {
    const html = renderThumbnailHtml(INPUT);
    expect(html).toContain('<h1 style="margin-top:28px">무한 스크롤 &lt;미리&gt; 불러오기</h1>');
    expect(html).toContain('<div class="sub">피드 끝에 닿기 전에 &amp; 다음 페이지</div>');
    expect(html).toContain('<div class="tag">TROUBLESHOOTING</div>');
    expect(html).toContain('<span>Left</span><span>right.example</span>');
    expect(html).toContain(`width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px`);
    expect(html).not.toContain('<미리>');
  });
});

describe('findChrome', () => {
  test('GALLEY_CHROME이 있으면 존재 여부와 무관하게 그것', () => {
    expect(findChrome({ GALLEY_CHROME: '/no/such/chrome' })).toBe('/no/such/chrome');
  });

  test('PATH가 비면(후보 없음) undefined일 수 있다 — 값으로 돌려준다', () => {
    const found = findChrome({ PATH: '' });
    expect(found === undefined || typeof found === 'string').toBe(true);
  });
});

describe('thumbnail config', () => {
  test('세 키 모두 선택, 문자열이어야 한다', () => {
    expect(parseThumbnailConfig({})).toEqual({ ok: true, config: DEFAULT_THUMBNAIL_CONFIG });
    expect(parseThumbnailConfig({ footerLeft: 'Blog', defaultTag: 'RETRO', extra: 1 })).toEqual({
      ok: true,
      config: { footerLeft: 'Blog', footerRight: '', defaultTag: 'RETRO' },
    });
    expect(parseThumbnailConfig({ footerLeft: 1 })).toEqual({
      ok: false,
      code: 'THUMBNAIL_CONFIG_INVALID',
    });
    expect(parseThumbnailConfig([])).toEqual({ ok: false, code: 'THUMBNAIL_CONFIG_INVALID' });
  });

  test('파일 로더 — 없음·깨짐·정상', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'galley-thumb-config-'));
    try {
      expect(await loadThumbnailConfig(join(dir, 'none.json'))).toEqual({
        ok: false,
        code: 'THUMBNAIL_CONFIG_MISSING',
      });
      await writeFile(join(dir, 'broken.json'), '{ nope');
      expect(await loadThumbnailConfig(join(dir, 'broken.json'))).toEqual({
        ok: false,
        code: 'THUMBNAIL_CONFIG_INVALID',
      });
      await writeFile(join(dir, 'ok.json'), '{"footerLeft":"L","footerRight":"R"}');
      expect(await loadThumbnailConfig(join(dir, 'ok.json'))).toEqual({
        ok: true,
        config: { footerLeft: 'L', footerRight: 'R', defaultTag: 'TROUBLESHOOTING' },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('기본 경로 — env 우선, 없으면 리포 루트 .galley/thumbnail.json', () => {
    expect(defaultThumbnailConfigPath({ THUMBNAIL_CONFIG_PATH: '/x/t.json' })).toBe('/x/t.json');
    expect(defaultThumbnailConfigPath({})).toMatch(/[/\\]\.galley[/\\]thumbnail\.json$/);
  });
});

/** PNG IHDR에서 폭·높이(빅엔디언 4바이트씩, 오프셋 16·20). */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const chrome = findChrome();

describe.skipIf(chrome === undefined)('ChromeThumbnailRenderer (설치된 Chrome)', () => {
  test('1200×630 배율 2 PNG를 돌려준다', async () => {
    const renderer = new ChromeThumbnailRenderer({ chromePath: chrome });
    const result = await renderer.render(INPUT);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(pngSize(result.png)).toEqual({
      width: THUMBNAIL_WIDTH * THUMBNAIL_SCALE,
      height: THUMBNAIL_HEIGHT * THUMBNAIL_SCALE,
    });
  }, 90_000);

  test('제한 시간을 넘기면 THUMBNAIL_RENDER_TIMEOUT(재시도 가능 경로)', async () => {
    const renderer = new ChromeThumbnailRenderer({ chromePath: chrome, timeoutMs: 1 });
    expect(await renderer.render(INPUT)).toMatchObject({
      ok: false,
      code: 'THUMBNAIL_RENDER_TIMEOUT',
    });
  }, 30_000);
});

describe('ChromeThumbnailRenderer (Chrome 없이)', () => {
  test('실행 파일을 못 찾으면 THUMBNAIL_CHROME_NOT_FOUND(값)', async () => {
    // macOS는 앱 경로 후보가 env와 무관하게 존재할 수 있어 그때는 이 경우를 만들 수 없다.
    if (findChrome({ PATH: '' }) !== undefined) return;
    const renderer = new ChromeThumbnailRenderer({ env: { PATH: '' } });
    expect(await renderer.render(INPUT)).toEqual({ ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' });
  });

  test('실행 파일이 잘못된 경로면 THUMBNAIL_RENDER_FAILED(값)', async () => {
    const renderer = new ChromeThumbnailRenderer({ chromePath: '/no/such/chrome' });
    expect(await renderer.render(INPUT)).toMatchObject({
      ok: false,
      code: 'THUMBNAIL_RENDER_FAILED',
    });
  });
});
