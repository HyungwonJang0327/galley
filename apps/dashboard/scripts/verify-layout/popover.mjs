// Popover 위치·폭·뒤집힘·닫는 경로·포커스 실측.
// 갤러리(/design)의 Popover 데모 트리거 글자("팝오버 기본"·"팝오버 오른쪽"·"팝오버 화면 하단")에 결합되어 있다 —
// 갤러리를 바꾸면 여기도 맞춘다. "화면 하단" 트리거는 페이지 맨 아래 카드에 있어야 한다(Select·Menu와 공유).
// 실제 마우스·키 입력을 쓴다: 포커스 링(:focus-visible)은 직전 입력이 포인터인지 키보드인지에 달려 있다.
import { join } from 'node:path';
import { sleep } from './cdp.mjs';

const OFFSET = 6; // Popover.tsx의 sideOffset

export async function verifyPopover(page, { outDir }) {
  const name = 'Popover 위치·닫기·포커스';
  const checks = [];
  const add = (label, pass) => checks.push({ label, pass });
  const near = (a, b) => Math.abs(a - b) <= 1;

  // 1. 마우스로 열기(기본: 아래·가운데)
  const basic = await locate(page, '팝오버 기본', 'center');
  if (basic.error) return { name, checks: [{ label: basic.error, pass: false }] };
  await page.mouseClick(basic.x, basic.y);
  await sleep(400);
  let m = await measure(page, '팝오버 기본');
  add('[기본] 마우스로 누르면 열린다(aria-expanded true)', m.open && m.expanded === 'true');
  add(
    `[기본] 트리거 아래 ${OFFSET}px (${m.gapBelow})`,
    m.side === 'bottom' && near(m.gapBelow, OFFSET),
  );
  add(`[기본] 가운데 정렬 (중심 차 ${m.centerDiff})`, near(m.centerDiff, 0));
  add(`[기본] 폭 ≤ 상한 토큰 (${m.width} ≤ ${m.maxWidth})`, m.width <= m.maxWidth + 0.5);
  add('[기본] 팝업이 뷰포트 안', m.inViewport);
  add('[기본] 포커스가 팝업 안으로 들어간다', m.focusInPopup);
  add(`[기본] 마우스로 열면 팝업에 포커스 링이 없다 (${m.outline})`, m.outline === 'none');
  await page.screenshot(join(outDir, 'popover-1.png'));

  // 2. Esc → 닫히고 트리거로 포커스 복귀
  await page.pressKey('Escape');
  await sleep(400);
  m = await measure(page, '팝오버 기본');
  add('[기본] Esc로 닫히고 포커스가 트리거로 돌아온다', !m.open && m.triggerFocused);

  // 3. 키보드로 열기 → 포커스 가능 요소가 없는 팝업이 포커스를 받고 링이 보인다
  await page.pressKey('Enter');
  await sleep(400);
  m = await measure(page, '팝오버 기본');
  add('[기본] Enter로 열린다', m.open);
  add(
    `[기본] 키보드로 열면 팝업에 포커스 링이 보인다 (${m.outline})`,
    m.open && m.outline !== 'none',
  );

  // 4. 바깥 클릭(실제 마우스) → 닫힌다. TopBar 가운데는 어떤 팝업과도 겹치지 않는다.
  await page.mouseClick(700, 24);
  await sleep(400);
  m = await measure(page, '팝오버 기본');
  add('[기본] 바깥을 누르면 닫힌다', !m.open);

  // 5. 오른쪽·위 맞춤
  const right = await locate(page, '팝오버 오른쪽', 'center');
  await page.mouseClick(right.x, right.y);
  await sleep(400);
  m = await measure(page, '팝오버 오른쪽');
  add(
    `[오른쪽] 트리거 오른쪽 ${OFFSET}px (${m.gapRight})`,
    m.side === 'right' && near(m.gapRight, OFFSET),
  );
  add(`[오른쪽] 위 맞춤(align start, top 차 ${m.topDiff})`, near(m.topDiff, 0));
  await page.pressKey('Escape');
  await sleep(300);

  // 6. 화면 하단 → 위로 뒤집힌다
  const bottom = await locate(page, '팝오버 화면 하단', 'bottom');
  if (bottom.error) {
    add(`[화면 하단] ${bottom.error}`, false);
    return { name, checks };
  }
  await page.mouseClick(bottom.x, bottom.y);
  await sleep(400);
  m = await measure(page, '팝오버 화면 하단');
  add(
    '[화면 하단] 아래 공간 부족 시 위로 뒤집힌다(popup.bottom ≤ trigger.top)',
    m.open && m.flippedAbove,
  );
  add('[화면 하단] 팝업이 뷰포트 안', m.inViewport);
  await page.screenshot(join(outDir, 'popover-2.png'));
  await page.pressKey('Escape');
  await sleep(300);

  return { name, checks };
}

const find = (text) =>
  `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})`;

/** 트리거를 화면에 들이고(가운데 또는 main 맨 아래) 그 중심의 뷰포트 좌표를 돌려준다. */
async function locate(page, text, where) {
  return JSON.parse(
    await page.evaluate(`(async () => {
      const trigger = ${find(text)};
      if (!trigger) return JSON.stringify({ error: '트리거를 찾지 못함: ' + ${JSON.stringify(text)} });
      const main = document.querySelector('main');
      if (${JSON.stringify(where)} === 'bottom') main.scrollTop = main.scrollHeight;
      else trigger.scrollIntoView({ block: 'center' });
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));
      const r = trigger.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`),
  );
}

/** 열린 팝업(이 트리거의 aria-controls)과 트리거의 관계를 잰다. */
async function measure(page, text) {
  return JSON.parse(
    await page.evaluate(`(() => {
      const trigger = ${find(text)};
      const popup = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
      const base = {
        open: !!popup,
        expanded: trigger.getAttribute('aria-expanded'),
        triggerFocused: document.activeElement === trigger,
      };
      if (!popup) return JSON.stringify(base);
      const round = (n) => Math.round(n * 100) / 100;
      const t = trigger.getBoundingClientRect();
      const p = popup.getBoundingClientRect();
      // 상한 토큰은 min() 식이라 그대로 못 읽는다 — 같은 max-width를 준 임시 요소로 잰다.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;visibility:hidden;width:9999px;max-width:var(--ui-popover-max-width)';
      document.body.append(probe);
      const maxWidth = probe.getBoundingClientRect().width;
      probe.remove();
      return JSON.stringify({
        ...base,
        side: popup.dataset.side,
        width: round(p.width),
        maxWidth: round(maxWidth),
        gapBelow: round(p.top - t.bottom),
        gapRight: round(p.left - t.right),
        centerDiff: round(p.left + p.width / 2 - (t.left + t.width / 2)),
        topDiff: round(p.top - t.top),
        flippedAbove: p.bottom <= t.top,
        inViewport: p.top >= 0 && p.left >= 0 && p.bottom <= innerHeight && p.right <= innerWidth,
        focusInPopup: popup === document.activeElement || popup.contains(document.activeElement),
        outline: getComputedStyle(popup).outlineStyle,
      });
    })()`),
  );
}
