// Toast 뷰포트 위치·폭·쌓임·limit·닫기·역할 실측.
// 갤러리(/design) Toast 섹션(data-demo="toast", 버튼 글자 info·success·warning·danger·"모두 닫기", limit 3)에
// 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다. 실제 마우스 클릭을 쓴다(뷰포트 hover 펼침과 구분하려고).
import { join } from 'node:path';
import { sleep } from './cdp.mjs';

export async function verifyToast(page, { outDir }) {
  const name = 'Toast 위치·쌓임·닫기';
  const checks = [];
  const add = (label, pass) => checks.push({ label, pass });
  const near = (a, b) => Math.abs(a - b) <= 1;

  const first = await locate(page, 'info');
  if (first.error) return { name, checks: [{ label: first.error, pass: false }] };

  // 1. 하나 띄우기
  await page.mouseClick(first.x, first.y);
  await sleep(400);
  let m = await measure(page);
  add(
    '뷰포트는 role="region"이고 이름이 있다',
    m.viewport.role === 'region' && m.viewport.label !== '',
  );
  add(
    `뷰포트 오른쪽 여백 = --ui-toast-inset (${m.viewport.rightGap} = ${m.space4})`,
    near(m.viewport.rightGap, m.space4),
  );
  add(
    `뷰포트가 TopBar 아래에서 시작한다 — 앱이 덧씌운 --ui-toast-inset-top (top ${m.viewport.top} = TopBar ${m.topbarHeight} + ${m.space4})`,
    near(m.viewport.top, m.topbarHeight + m.space4),
  );
  add(
    `뷰포트 폭 = 토큰 (${m.viewport.width} = ${m.toastWidth})`,
    near(m.viewport.width, m.toastWidth),
  );
  add(
    `토스트 1개, role=dialog (${m.toasts.length}개, ${m.toasts[0]?.role})`,
    m.toasts.length === 1 && m.toasts[0].role === 'dialog',
  );
  add(
    `토스트 폭이 뷰포트를 채운다 (${m.toasts[0]?.width} = ${m.viewport.width})`,
    near(m.toasts[0]?.width, m.viewport.width),
  );
  add(
    `아이콘이 제목 첫 줄 세로 가운데 (차 ${m.toasts[0]?.iconVsTitle})`,
    near(m.toasts[0]?.iconVsTitle, 0),
  );
  add('토스트가 들어온 뒤 완전히 보인다(opacity 1)', m.toasts[0]?.opacity === '1');

  // 2. danger → alertdialog, 아이콘 색이 tone별로 다르다
  const danger = await locate(page, 'danger');
  await page.mouseClick(danger.x, danger.y);
  await sleep(400);
  m = await measure(page);
  add(
    `danger는 role=alertdialog (${m.toasts.map((t) => t.role).join('·')})`,
    m.toasts.some((t) => t.role === 'alertdialog'),
  );
  add(
    'tone마다 아이콘 색이 다르다',
    new Set(m.toasts.map((t) => t.iconColor)).size === m.toasts.length,
  );
  add(`토스트 사이 간격 space-2 (${m.gap} = ${m.space2})`, near(m.gap, m.space2));
  // DOM 순서가 아니라 화면 좌표로 — 최신(alertdialog)이 이전 것보다 위에 그려져야 한다.
  const newest = m.toasts.find((t) => t.role === 'alertdialog');
  const older = m.toasts.find((t) => t.role === 'dialog');
  add(
    `새 토스트가 화면에서 위에 온다(top-right는 최신이 맨 위: ${newest?.top} < ${older?.top})`,
    newest !== undefined && older !== undefined && newest.top < older.top,
  );
  await page.screenshot(join(outDir, 'toast-1.png'));

  // 3. limit 3 초과 → 4번째부터 오래된 것이 data-limited로 숨는다
  for (const label of ['success', 'warning']) {
    const b = await locate(page, label);
    await page.mouseClick(b.x, b.y);
    await sleep(250);
  }
  await sleep(400);
  m = await measure(page);
  add(
    `limit 3: 4개 중 보이는 것 3개 (보임 ${m.visibleCount} · limited ${m.limitedCount})`,
    m.visibleCount === 3 && m.limitedCount === 1,
  );
  add('뷰포트가 뷰포트 밖으로 넘치지 않는다', m.viewport.bottom <= m.innerHeight);

  // 4. 마우스를 올리면 닫기 버튼이 보조 기술에 드러나고, 클릭하면 닫힌다
  // React의 onMouseEnter는 mouseover/mouseout 쌍으로 계산한다 — relatedTarget 없는 mouseover가 "밖→안"이 된다.
  await page.evaluate(
    `document.querySelector('[role="region"][aria-live]').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))`,
  );
  await sleep(300);
  m = await measure(page);
  add('마우스를 올리면(펼침) 닫기 버튼의 aria-hidden이 풀린다', m.toasts[0]?.closeHidden === false);
  await page.mouseClick(m.toasts[0].closeCenter.x, m.toasts[0].closeCenter.y);
  await sleep(500);
  const after = await measure(page);
  add(
    `닫기 버튼으로 하나 닫힌다 (${m.toasts.length} → ${after.toasts.length})`,
    after.toasts.length === m.toasts.length - 1,
  );

  // 5. 모두 닫기
  const closeAll = await locate(page, '모두 닫기');
  await page.mouseClick(closeAll.x, closeAll.y);
  await sleep(600);
  const end = await measure(page);
  add(`모두 닫기 뒤 토스트 0개 (${end.toasts.length})`, end.toasts.length === 0);

  return { name, checks };
}

async function locate(page, label) {
  return JSON.parse(
    await page.evaluate(`(() => {
      const demo = document.querySelector('[data-demo="toast"]');
      if (!demo) return JSON.stringify({ error: 'Toast 데모를 찾지 못함' });
      demo.scrollIntoView({ block: 'center' });
      const button = [...demo.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
      if (!button) return JSON.stringify({ error: 'Toast 버튼 없음: ' + ${JSON.stringify(label)} });
      const r = button.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`),
  );
}

async function measure(page) {
  return JSON.parse(
    await page.evaluate(`(() => {
      const round = (n) => Math.round(n * 100) / 100;
      const px = (v) => parseFloat(v);
      const rootStyle = getComputedStyle(document.documentElement);
      const viewport = document.querySelector('[role="region"][aria-live]');
      // 갤러리에는 다른 region(목록 영역)도 있다 — 토스트 뷰포트만 aria-live를 가진다.
      const vr = viewport.getBoundingClientRect();
      const toasts = [...viewport.querySelectorAll('[role="dialog"],[role="alertdialog"]')].map((el) => {
        const r = el.getBoundingClientRect();
        const icon = el.querySelector('svg');
        // 제목 = aria-labelledby가 가리키는 요소(설명도 id를 가지므로 "첫 id 요소"로 찾지 않는다)
        const title = document.getElementById(el.getAttribute('aria-labelledby'));
        const close = el.querySelector('button[aria-label]');
        const ir = icon.getBoundingClientRect();
        const tr = title.getBoundingClientRect();
        const cr = close.getBoundingClientRect();
        const lineHeight = px(getComputedStyle(title).lineHeight);
        return {
          role: el.getAttribute('role'),
          limited: el.hasAttribute('data-limited'),
          visible: getComputedStyle(el).display !== 'none',
          width: round(r.width),
          top: round(r.top),
          bottom: round(r.bottom),
          opacity: getComputedStyle(el).opacity,
          iconColor: getComputedStyle(icon.parentElement).color,
          iconVsTitle: round(ir.top + ir.height / 2 - (tr.top + lineHeight / 2)),
          closeHidden: close.getAttribute('aria-hidden') === 'true',
          closeCenter: { x: cr.left + cr.width / 2, y: cr.top + cr.height / 2 },
          center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        };
      });
      // 화면 순서로 정렬해 간격을 잰다(DOM 순서 = 시각 순서를 가정하지 않는다)
      const shown = toasts.filter((t) => t.visible).sort((a, b) => a.top - b.top);
      const gap = shown.length >= 2 ? round(shown[1].top - shown[0].bottom) : null;
      return JSON.stringify({
        space2: px(rootStyle.getPropertyValue('--ui-space-2')),
        space4: px(rootStyle.getPropertyValue('--ui-space-4')),
        topbarHeight: px(rootStyle.getPropertyValue('--ui-topbar-height')),
        toastWidth: px(rootStyle.getPropertyValue('--ui-toast-width')),
        innerHeight: window.innerHeight,
        viewport: {
          role: viewport.getAttribute('role'),
          label: viewport.getAttribute('aria-label') ?? '',
          top: round(vr.top),
          rightGap: round(window.innerWidth - vr.right),
          width: round(vr.width),
          bottom: round(vr.bottom),
        },
        toasts,
        visibleCount: shown.length,
        limitedCount: toasts.filter((t) => t.limited).length,
        gap,
      });
    })()`),
  );
}
