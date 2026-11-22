// 페이지 조립은 순수 테스트, 실제 렌더는 설치된 Chrome이 있을 때만(없으면 건너뜀 — CI 러너는 google-chrome이 있다).
import { describe, test, expect } from 'vitest';
import {
  ChromeIllustrationRenderer,
  cleanIllustrationSvg,
  ILLUSTRATION_HEIGHT,
  ILLUSTRATION_SCALE,
  ILLUSTRATION_WIDTH,
  renderIllustrationHtml,
} from './illustration.ts';
import { findChrome } from './thumbnail.ts';

const SVG =
  '<svg width="1200" height="520" viewBox="0 0 1200 520" xmlns="http://www.w3.org/2000/svg"><rect x="100" y="100" width="300" height="200" rx="20" fill="#FFFFFF" filter="url(#soft)"/><text x="600" y="490" text-anchor="middle">캡션</text></svg>';

describe('cleanIllustrationSvg', () => {
  test('앞뒤 글자를 떼고 svg 요소만, 스크립트·외부 주소는 거른다', () => {
    const dirty = `설명\n${SVG.replace('<rect', '<script>x()</script><image href="https://x.example/a.png"/><rect')}\n끝`;
    expect(cleanIllustrationSvg(dirty)).toBe(
      SVG.replace(
        ' fill="#FFFFFF" filter="url(#soft)"/>',
        ' fill="#FFFFFF" filter="url(#soft)" />',
      ),
    );
  });

  test('네임스페이스가 없으면 붙이고, svg 요소가 없으면 undefined', () => {
    expect(cleanIllustrationSvg('<svg width="10"><g></g></svg>')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10"><g></g></svg>',
    );
    expect(cleanIllustrationSvg('그림 없음 <div>a</div>')).toBeUndefined();
    expect(cleanIllustrationSvg('')).toBeUndefined();
  });
});

describe('renderIllustrationHtml', () => {
  test('배경·공용 defs·거른 SVG를 1200×520 틀에 넣고 CSP로 스크립트·외부 로드를 막는다', () => {
    const html = renderIllustrationHtml(`${SVG}<script>alert(1)</script>`, 'ja');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain(`width:${ILLUSTRATION_WIDTH}px;height:${ILLUSTRATION_HEIGHT}px`);
    expect(html).toContain(`content="default-src 'none'; style-src 'unsafe-inline'"`);
    for (const id of ['soft', 'softSm', 'arr', 'arrRed']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('filter="url(#soft)"');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  test('svg가 없으면 배경만', () => {
    expect(renderIllustrationHtml('그림 없음')).toContain('</defs></svg></div>');
  });
});

/** PNG IHDR에서 폭·높이(빅엔디언 4바이트씩, 오프셋 16·20). */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

const chrome = findChrome();

describe.skipIf(chrome === undefined)('ChromeIllustrationRenderer (설치된 Chrome)', () => {
  test('1200×520 배율 2 PNG를 돌려준다', async () => {
    const renderer = new ChromeIllustrationRenderer({ chromePath: chrome });
    expect(await renderer.check()).toEqual({ ok: true });
    const result = await renderer.render(SVG, 'ko');
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(pngSize(result.png)).toEqual({
      width: ILLUSTRATION_WIDTH * ILLUSTRATION_SCALE,
      height: ILLUSTRATION_HEIGHT * ILLUSTRATION_SCALE,
    });
  }, 90_000);
});
