// Menu 팝업 폭·정렬·아이템 레이아웃·뒤집힘 실측.
// 갤러리(/design)의 Menu 데모 트리거 aria-label에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
import { join } from 'node:path';

/** 갤러리 Menu 데모 트리거의 aria-label. 순서대로 열어 측정한다. */
const LABELS = ['메뉴 기본', '메뉴 보조와 메타', '메뉴 긴 라벨', '메뉴 화면 하단'];

export async function verifyMenu(page, { outDir }) {
  const checks = [];
  for (const [index, label] of LABELS.entries()) {
    const m = JSON.parse(await page.evaluate(measureExpression(label)));
    if (m.error) {
      checks.push({ label: `[${label}] ${m.error}`, pass: false });
      continue;
    }
    const minWidth = parseFloat(m.minWidth);
    const maxWidth = parseFloat(m.maxWidth);
    const items = [
      [`팝업 폭 ≥ 최소 폭(${m.minWidth})`, m.popup.width >= Math.round(minWidth)],
      [`팝업 폭 ≤ 상한(${m.maxWidth})`, m.popup.width <= Math.round(maxWidth)],
      [
        '팝업이 뷰포트 안',
        m.popup.top >= 0 &&
          m.popup.bottom <= m.innerHeight &&
          m.popup.left >= 0 &&
          m.popup.right <= m.innerWidth,
      ],
      [
        '팝업 오른쪽 끝 = 트리거 오른쪽 끝(align end)',
        Math.abs(m.popup.right - m.trigger.right) <= 1,
      ],
      ['라벨 ≤ 2줄', m.options.every((o) => o.labelLines === null || o.labelLines <= 2)],
      ['보조 텍스트 1줄', m.options.every((o) => o.descLines === null || o.descLines === 1)],
      ['메타 폭 유지(> 0)', m.options.every((o) => o.metaWidth === null || o.metaWidth > 10)],
    ];
    if (label === '메뉴 기본') {
      items.push(
        ['구분선 있음', m.separators > 0],
        ['disabled 항목 aria-disabled', m.disabledCount > 0],
      );
    }
    if (label === '메뉴 긴 라벨') {
      items.push(
        ['긴 내용이면 상한 폭까지 넓어짐', Math.abs(m.popup.width - maxWidth) <= 1],
        ['팝업 가로 넘침 없음(overflow-wrap anywhere)', m.popupHorizontalOverflow === false],
        ['긴 보조는 ellipsis로 잘림', m.options.some((o) => o.descEllipsis === true)],
      );
    }
    if (label === '메뉴 화면 하단') {
      items.push([
        '아래 공간 부족 시 위로 뒤집힘(popup.bottom ≤ trigger.top)',
        m.popup.bottom <= m.trigger.top,
      ]);
    } else {
      items.push([
        '공간이 있으면 아래로 열림(popup.top ≥ trigger.bottom)',
        m.popup.top >= m.trigger.bottom,
      ]);
    }
    for (const [text, pass] of items) checks.push({ label: `[${label}] ${text}`, pass });

    // 팝업이 열린 상태 그대로 찍는다.
    await page.screenshot(join(outDir, `menu-${index + 1}.png`));
    await page.evaluate(closeExpression(label));
  }
  return { name: 'Menu 팝업·아이템 레이아웃', checks };
}

/** 트리거를 열고 팝업·항목·트리거 치수를 JSON 문자열로 돌려주는 페이지 코드. */
function measureExpression(label) {
  const L = JSON.stringify(label);
  return `(async () => {
    const trigger = document.querySelector('button[aria-label=' + ${JSON.stringify(L)} + ']');
    if (!trigger) return JSON.stringify({ error: 'trigger not found' });
    const main = document.querySelector('main');
    // 화면 하단 케이스는 페이지 맨 아래(main 끝)로, 나머지는 트리거를 뷰포트 가운데로.
    if (${L} === '메뉴 화면 하단') main.scrollTop = main.scrollHeight;
    else trigger.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 100));
    const fire = (el, type) =>
      el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0 }));
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(trigger, type);
    // 닫히는 팝업은 exit 애니메이션 동안 DOM에 남으므로 data-open인 menu만 본다.
    let menu = null;
    for (let i = 0; i < 20 && !menu; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const el = document.querySelector('[role="menu"][data-open]');
      if (el && el.getBoundingClientRect().height > 0) menu = el;
    }
    if (!menu) return JSON.stringify({ error: 'menu not open' });
    const rect = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
    const lineHeight = (el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.25;
    const options = [...menu.querySelectorAll('[role="menuitem"]')].map((o) => {
      const label = o.querySelector('[class*="label"]');
      const desc = o.querySelector('[class*="description"]');
      const meta = o.querySelector('[class*="meta"]');
      return {
        labelLines: label ? Math.round(label.getBoundingClientRect().height / lineHeight(label)) : null,
        descLines: desc ? Math.round(desc.getBoundingClientRect().height / lineHeight(desc)) : null,
        descEllipsis: desc ? desc.scrollWidth > desc.clientWidth : null,
        metaWidth: meta ? Math.round(meta.getBoundingClientRect().width) : null,
      };
    });
    const menuStyle = getComputedStyle(menu);
    return JSON.stringify({
      innerHeight, innerWidth,
      trigger: rect(trigger), popup: rect(menu),
      minWidth: menuStyle.minWidth, maxWidth: menuStyle.maxWidth,
      options,
      separators: menu.querySelectorAll('[role="separator"]').length,
      disabledCount: menu.querySelectorAll('[role="menuitem"][aria-disabled="true"]').length,
      popupHorizontalOverflow: menu.scrollWidth > menu.clientWidth,
    });
  })()`;
}

/** Escape로 닫고 menu가 DOM에서 사라질 때까지 기다리는 페이지 코드. */
function closeExpression(label) {
  return `(async () => {
    const trigger = document.querySelector('button[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']');
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (!document.querySelector('[role="menu"]')) break;
    }
    trigger?.blur();
    return !document.querySelector('[role="menu"]');
  })()`;
}
