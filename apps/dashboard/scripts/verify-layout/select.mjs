// Select 팝업 폭·높이·아이템 레이아웃·뒤집힘·트리거 폭 실측 (decisions/layout.md 2026-09-10 Select 규칙).
// 갤러리(/design)의 Select 데모 aria-label에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
import { join } from 'node:path';

/** 갤러리 "Select" 카드들의 aria-label. 순서대로 열어 측정한다. */
const LABELS = [
  '라벨만',
  '라벨과 보조',
  '라벨과 보조와 메타',
  '긴 라벨',
  '경로 라벨',
  '항목 40개',
  '긴 선택값',
  '화면 하단',
];

export async function verifySelect(page, { outDir }) {
  const checks = [];
  for (const [index, label] of LABELS.entries()) {
    const m = JSON.parse(await page.evaluate(measureExpression(label)));
    if (m.error) {
      checks.push({ label: `[${label}] ${m.error}`, pass: false });
      continue;
    }
    const maxWidth = parseFloat(m.maxWidth);
    const maxHeight = parseFloat(m.maxHeight);
    const items = [
      ['팝업 폭 ≥ 트리거 폭', m.popup.width >= m.trigger.width],
      [`팝업 폭 ≤ 상한(${m.maxWidth})`, m.popup.width <= Math.round(maxWidth)],
      [
        '팝업이 뷰포트 안',
        m.popup.bottom <= m.innerHeight && m.popup.top >= 0 && m.popup.right <= m.innerWidth,
      ],
      ['라벨 ≤ 2줄', m.options.every((o) => o.labelLines === null || o.labelLines <= 2)],
      ['보조 텍스트 1줄', m.options.every((o) => o.descLines === null || o.descLines === 1)],
      ['메타 폭 유지(> 0)', m.options.every((o) => o.metaWidth === null || o.metaWidth > 10)],
    ];
    if (label === '라벨만') {
      items.push([
        '팝업 폭 = 트리거 폭(내용이 더 좁아도 좁아지지 않음)',
        m.popup.width === m.trigger.width,
      ]);
    }
    if (label === '긴 라벨') {
      items.push(['긴 보조는 ellipsis로 잘림', m.options.some((o) => o.descEllipsis === true)]);
    }
    if (label === '경로 라벨') {
      items.push([
        '팝업 가로 넘침 없음(overflow-wrap anywhere)',
        m.popupHorizontalOverflow === false,
      ]);
    }
    if (label === '항목 40개') {
      items.push(
        [`팝업 높이 ≤ 상한(${m.maxHeight})`, m.popup.height <= Math.round(maxHeight)],
        ['팝업 세로 스크롤 가능', m.popupScrollable === true],
        ['열릴 때 선택 항목이 보임', m.selectedVisible === true],
      );
    }
    if (label === '긴 선택값') {
      items.push(
        ['트리거 폭 = 부모 폭(내용이 늘리지 않음)', m.trigger.width === m.parentWidth],
        ['트리거 내용 넘침 없음', m.triggerContentOverflow === false],
        ['값 nowrap + ellipsis', m.valueWhiteSpace === 'nowrap' && m.valueEllipsis === true],
      );
    }
    if (label === '화면 하단') {
      items.push([
        '아래 공간 부족 시 위로 뒤집힘(popup.bottom ≤ trigger.top)',
        m.popup.bottom <= m.trigger.top,
      ]);
    }
    for (const [text, pass] of items) checks.push({ label: `[${label}] ${text}`, pass });

    // 팝업이 열린 상태 그대로 찍는다.
    await page.screenshot(join(outDir, `select-${index + 1}.png`));
    await page.evaluate(closeExpression(label));
  }
  return { name: 'Select 팝업·아이템 레이아웃', checks };
}

/** 트리거를 열고 팝업·옵션·트리거 치수를 JSON 문자열로 돌려주는 페이지 코드. */
function measureExpression(label) {
  const L = JSON.stringify(label);
  return `(async () => {
    const trigger = document.querySelector('[role="combobox"][aria-label=' + ${JSON.stringify(L)} + ']');
    if (!trigger) return JSON.stringify({ error: 'trigger not found' });
    const main = document.querySelector('main');
    // 화면 하단 케이스는 페이지 맨 아래(main 끝)로, 나머지는 트리거를 뷰포트 가운데로.
    if (${L} === '화면 하단') main.scrollTop = main.scrollHeight;
    else trigger.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 100));
    const fire = (el, type) =>
      el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0 }));
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(trigger, type);
    // 닫히는 팝업은 exit 애니메이션 동안 DOM에 남으므로 aria-controls로 이 트리거의 listbox만 본다.
    let listbox = null;
    for (let i = 0; i < 20 && !listbox; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const id = trigger.getAttribute('aria-controls');
      const el = id ? document.getElementById(id) : null;
      if (el && el.getBoundingClientRect().height > 0) listbox = el;
    }
    if (!listbox) return JSON.stringify({ error: 'listbox not open' });
    const popup = listbox.closest('[class*="popup"]') || listbox.parentElement;
    // Base UI는 팝업을 연 뒤 비동기로 선택 항목까지 스크롤한다(직후 scrollTop 0 → 곧 이동).
    // 멈춘 뒤에 재야 "열릴 때 선택 항목이 보임"을 실제로 검사한다.
    for (let i = 0, last = -1; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (popup.scrollTop === last) break;
      last = popup.scrollTop;
    }
    const rect = (el) => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
    const lineHeight = (el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.25;
    const options = [...listbox.querySelectorAll('[role="option"]')].map((o) => {
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
    const selected = listbox.querySelector('[role="option"][aria-selected="true"]');
    const pr = popup.getBoundingClientRect();
    const sr = selected ? selected.getBoundingClientRect() : null;
    const valueEl = trigger.querySelector('[class*="value"]');
    const popupStyle = getComputedStyle(popup);
    return JSON.stringify({
      innerHeight, innerWidth,
      trigger: rect(trigger), popup: rect(popup),
      maxWidth: popupStyle.maxWidth, maxHeight: popupStyle.maxHeight,
      options,
      popupScrollable: popup.scrollHeight > popup.clientHeight,
      popupHorizontalOverflow: popup.scrollWidth > popup.clientWidth,
      selectedVisible: sr ? sr.top >= pr.top - 1 && sr.bottom <= pr.bottom + 1 : null,
      parentWidth: Math.round(trigger.parentElement.getBoundingClientRect().width),
      triggerContentOverflow: trigger.scrollWidth > trigger.clientWidth,
      valueEllipsis: valueEl ? valueEl.scrollWidth > valueEl.clientWidth : null,
      valueWhiteSpace: valueEl ? getComputedStyle(valueEl).whiteSpace : null,
    });
  })()`;
}

/** Escape로 닫고 listbox가 DOM에서 사라질 때까지 기다리는 페이지 코드. */
function closeExpression(label) {
  return `(async () => {
    const trigger = document.querySelector('[role="combobox"][aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']');
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (!document.querySelector('[role="listbox"]')) break;
    }
    trigger?.blur();
    return !document.querySelector('[role="listbox"]');
  })()`;
}
