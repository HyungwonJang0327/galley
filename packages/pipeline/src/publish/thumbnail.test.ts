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
  splitThumbnailTitle,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_SCALE,
  THUMBNAIL_WIDTH,
  type ThumbnailInput,
} from './thumbnail.ts';

const INPUT: ThumbnailInput = {
  titleLines: ['무한 스크롤', '<미리>', '불러오기'],
  subtitle: '피드 끝에 닿기 전에 & 다음 페이지',
  tags: ['React', 'IntersectionObserver'],
  brand: 'Blog.log',
};

describe('renderThumbnailHtml', () => {
  test('제목 줄을 <br>로 잇고 마지막 줄만 강조, 값은 HTML 이스케이프', () => {
    const html = renderThumbnailHtml(INPUT);
    expect(html).toContain('<h1>무한 스크롤<br>&lt;미리&gt;<br><em>불러오기</em></h1>');
    expect(html).toContain('<p class="sub">피드 끝에 닿기 전에 &amp; 다음 페이지</p>');
    expect(html).toContain('<div class="brand">Blog.log</div>');
    expect(html).toContain(`width:${THUMBNAIL_WIDTH}px;height:${THUMBNAIL_HEIGHT}px`);
    expect(html).not.toContain('<미리>');
    expect(html).not.toContain('class="series"');
  });

  test('태그는 색 점 알약으로 최대 3개, 색은 순서대로', () => {
    const html = renderThumbnailHtml({ ...INPUT, tags: ['a', ' ', 'b', 'c', 'd'] });
    expect(html.match(/class="pill"/g)).toHaveLength(3);
    expect(html).toContain(
      '<span class="pill" style="background:#E8F1FF;color:#2563EB"><i style="background:#2563EB"></i>a</span>',
    );
    expect(html).not.toContain('</i>d</span>');
  });

  test('한 줄이면 그 줄이 강조, 4줄 이상은 앞 3줄, 빈 부제·브랜드는 자리 없음', () => {
    const one = renderThumbnailHtml({ titleLines: ['한 줄'], subtitle: ' ', tags: [], brand: '' });
    expect(one).toContain('<h1><em>한 줄</em></h1>');
    expect(one).not.toContain('class="sub"');
    expect(one).not.toContain('class="brand"');
    const four = renderThumbnailHtml({ ...INPUT, titleLines: ['1', '2', '3', '4'] });
    expect(four).toContain('<h1>1<br>2<br><em>3</em></h1>');
  });

  test('시리즈 배지 — 지난 편·이번 편 점과 EP 두 자리', () => {
    const html = renderThumbnailHtml({
      ...INPUT,
      series: { name: '실무 <트러블>', episodeNo: 2, total: 3 },
    });
    expect(html).toContain(
      '<div class="series"><span class="sname">실무 &lt;트러블&gt;</span><span class="dots"><i class="done"></i><i class="on"></i><i class=""></i></span><span class="ep">EP 02<small> / 03</small></span></div><div class="brand">',
    );
  });

  test('편이 12개를 넘으면 점은 빼고 번호만', () => {
    const html = renderThumbnailHtml({ ...INPUT, series: { name: 'S', episodeNo: 3, total: 20 } });
    expect(html).not.toContain('class="dots"');
    expect(html).toContain('EP 03<small> / 20</small>');
  });
});

describe('splitThumbnailTitle', () => {
  test('낱말 단위로 한 줄 9자 안팎, 최대 3줄', () => {
    expect(splitThumbnailTitle('무한 스크롤 미리 불러오기')).toEqual([
      '무한 스크롤 미리',
      '불러오기',
    ]);
    expect(splitThumbnailTitle('스냅과 아티클을 한 피드에 섞는 데이터 모델')).toEqual([
      '스냅과 아티클을',
      '한 피드에 섞는',
      '데이터 모델',
    ]);
  });

  test('끝의 괄호 부제는 떼고, 3줄을 넘는 낱말은 마지막 줄에 붙인다', () => {
    expect(splitThumbnailTitle('PG사 무중단 전환기 (Toss에서 NicePay로)')).toEqual([
      'PG사 무중단',
      '전환기',
    ]);
    expect(splitThumbnailTitle('가나다라마바사 가나다라마바사 가나다라마바사 끝 말')).toEqual([
      '가나다라마바사',
      '가나다라마바사',
      '가나다라마바사 끝 말',
    ]);
    expect(splitThumbnailTitle('(괄호뿐)')).toEqual(['(괄호뿐)']);
    expect(splitThumbnailTitle('  ')).toEqual([]);
  });
});

describe('findChrome', () => {
  test('GALLEY_CHROME이 있으면 존재 여부와 무관하게 그것', () => {
    expect(findChrome({ GALLEY_CHROME: '/no/such/chrome' })).toBe('/no/such/chrome');
  });

  test('PATH 이름 후보뿐인 플랫폼(linux)에서 PATH가 비면 undefined', () => {
    if (process.platform !== 'linux') return;
    expect(findChrome({ PATH: '' })).toBeUndefined();
  });
});

describe('thumbnail config', () => {
  test('brand는 선택, 문자열이어야 한다. 예전 footerLeft는 brand로 읽고 나머지 키는 무시', () => {
    expect(parseThumbnailConfig({})).toEqual({ ok: true, config: DEFAULT_THUMBNAIL_CONFIG });
    expect(parseThumbnailConfig({ brand: 'Blog', extra: 1 })).toEqual({
      ok: true,
      config: { brand: 'Blog' },
    });
    expect(
      parseThumbnailConfig({ footerLeft: 'Old', footerRight: 'x', defaultTag: 'RETRO' }),
    ).toEqual({ ok: true, config: { brand: 'Old' } });
    expect(parseThumbnailConfig({ brand: 'New', footerLeft: 'Old' })).toEqual({
      ok: true,
      config: { brand: 'New' },
    });
    expect(parseThumbnailConfig({ brand: 1 })).toEqual({
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
      await writeFile(join(dir, 'ok.json'), '{"brand":"B"}');
      expect(await loadThumbnailConfig(join(dir, 'ok.json'))).toEqual({
        ok: true,
        config: { brand: 'B' },
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

  test('지정한 절대경로에 파일이 없으면(오타) check·render 모두 THUMBNAIL_CHROME_NOT_FOUND', async () => {
    const renderer = new ChromeThumbnailRenderer({ chromePath: '/no/such/chrome' });
    expect(await renderer.check()).toEqual({ ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' });
    expect(await renderer.render(INPUT)).toEqual({ ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' });
  });

  test('실행 파일이 출력 없이 끝나면 THUMBNAIL_RENDER_FAILED(종료 코드 문구)', async () => {
    // node 자체를 "Chrome"으로 — 인자를 무시하고 바로 끝나 PNG가 없다.
    const renderer = new ChromeThumbnailRenderer({
      chromePath: process.execPath,
      timeoutMs: 20_000,
    });
    const result = await renderer.render(INPUT);
    expect(result).toMatchObject({ ok: false, code: 'THUMBNAIL_RENDER_FAILED' });
    if (!result.ok && result.code === 'THUMBNAIL_RENDER_FAILED')
      expect(result.detail).toContain('출력 없이 끝났다');
  });

  test('이미 중단된 신호면 프로세스를 띄우지 않고 중단 실패', async () => {
    const controller = new AbortController();
    controller.abort();
    const renderer = new ChromeThumbnailRenderer({ chromePath: process.execPath });
    expect(await renderer.render(INPUT, controller.signal)).toEqual({
      ok: false,
      code: 'THUMBNAIL_RENDER_FAILED',
      detail: '중단됨',
    });
  });
});
