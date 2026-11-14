// 강제 색상 모드(forced-colors: active) 실측 — CDP Emulation으로 켜고 /design에서 상태 구분·경계·글자가 살아 있는지 잰다.
// 갤러리 Switch·RadioGroup·Tabs·ListToolbar·Badge·Pagination·Table·ListRow·SplitPane(TimelineItem)·Skeleton·Separator·Button 섹션에 결합되어 있다.
// 기준: decisions/forced-colors.md — 토큰을 시스템 색으로 재정의(Highlight/HighlightText·CanvasText·GrayText·Canvas), 글자 있는 Highlight 채움은
// forced-color-adjust: none(백플레이트 회피), 투명 밑줄·배경만 있는 모양은 컴포넌트 블록.

export async function verifyForcedColors(page) {
  const name = '강제 색상 모드(forced-colors)';
  await page.emulateMedia([{ name: 'forced-colors', value: 'active' }]);
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };
  const sys = m.system;
  const checks = [
    [
      `에뮬레이션이 켜졌다 (matchMedia ${m.active}, Canvas ${sys.Canvas}, Highlight ${sys.Highlight})`,
      m.active === true,
    ],
    [
      `Switch 꺼짐: 손잡이가 트랙과 다른 색 (${m.switchOff.thumb} vs ${m.switchOff.track})`,
      m.switchOff.thumb !== m.switchOff.track && m.switchOff.thumb !== sys.Canvas,
    ],
    [
      `Switch 켜짐: 트랙 = Highlight, 손잡이 = HighlightText (${m.switchOn.track} / ${m.switchOn.thumb})`,
      m.switchOn.track === sys.Highlight && m.switchOn.thumb === sys.HighlightText,
    ],
    [
      `Radio 선택: 점이 원과 다른 색 (${m.radio.dot} vs ${m.radio.radio})`,
      m.radio.dot !== m.radio.radio && m.radio.radio === sys.Highlight,
    ],
    [
      `Tabs: 활성 탭만 밑줄(2px), 비활성은 0 (${m.tabs.join('/')})`,
      m.tabs.filter((w) => w > 0).length === 1 && m.tabs[0] === 2,
    ],
    [
      `ListToolbar 탭: 활성만 밑줄 (${m.toolbarTabs.join('/')})`,
      m.toolbarTabs.filter((w) => w > 0).length === 1,
    ],
    [
      `Badge: 윤곽선 1px CanvasText로 알약 유지 (${m.badge.outline})`,
      m.badge.outline === `${sys.CanvasText} solid 1px` || m.badge.outlineWidth === '1px',
    ],
    [`Badge pulse 점이 보인다 (${m.badge.dot})`, m.badge.dot === sys.CanvasText],
    [
      `Pagination 현재 쪽: Highlight 채움 + HighlightText 글자 + 백플레이트 없음(forced-color-adjust none) (${m.pagination.bg} / ${m.pagination.color} / ${m.pagination.fca})`,
      m.pagination.bg === sys.Highlight &&
        m.pagination.color === sys.HighlightText &&
        m.pagination.fca === 'none',
    ],
    [
      `Pagination 다른 쪽: 테두리가 보인다 (${m.pagination.otherBorder})`,
      m.pagination.otherBorder === sys.CanvasText,
    ],
    [
      `Table 선택 행: Highlight + HighlightText + none (${m.table.bg} / ${m.table.color} / ${m.table.fca})`,
      m.table.bg === sys.Highlight && m.table.color === sys.HighlightText && m.table.fca === 'none',
    ],
    [
      `ListRow 활성 행: Highlight + HighlightText + none (${m.listRow.bg} / ${m.listRow.color} / ${m.listRow.fca})`,
      m.listRow.bg === sys.Highlight &&
        m.listRow.color === sys.HighlightText &&
        m.listRow.fca === 'none',
    ],
    [
      `Button primary: Highlight + HighlightText + none, 테두리 보임 (${m.button.bg} / ${m.button.color} / ${m.button.fca})`,
      m.button.bg === sys.Highlight &&
        m.button.color === sys.HighlightText &&
        m.button.fca === 'none',
    ],
    [
      `TimelineItem: 세로선 CanvasText, 완료 마커 CanvasText, 진행 마커 Highlight, 대기 마커는 속이 빔 (${m.timeline.line} / ${m.timeline.done} / ${m.timeline.active} / ${m.timeline.pending})`,
      m.timeline.line === sys.CanvasText &&
        m.timeline.done === sys.CanvasText &&
        m.timeline.active === sys.Highlight &&
        m.timeline.pending === sys.Canvas &&
        m.timeline.pendingOutline === '1px',
    ],
    [`Skeleton 막대 = GrayText (${m.skeleton})`, m.skeleton === sys.GrayText],
    [`Separator = CanvasText (${m.separator})`, m.separator === sys.CanvasText],
    [`Card 테두리 = CanvasText (${m.card})`, m.card === sys.CanvasText],
    [
      `Checkbox 체크 아이콘이 상자와 다른 색 (${m.checkbox.icon} vs ${m.checkbox.box})`,
      m.checkbox.icon !== m.checkbox.box,
    ],
  ].map(([label, pass]) => ({ label, pass }));
  return { name, checks };
}

function measureExpression() {
  return `(async () => {
    const q = (s, root = document) => root.querySelector(s);
    const qa = (s, root = document) => [...root.querySelectorAll(s)];
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
    const col = (el) => (el ? getComputedStyle(el).color : null);
    const fca = (el) => (el ? getComputedStyle(el).forcedColorAdjust : null);
    const sysProbe = document.createElement('div');
    sysProbe.style.cssText = 'position:absolute;color:CanvasText;background:Canvas;border:1px solid Highlight;outline-color:HighlightText;text-decoration-color:GrayText;';
    document.body.appendChild(sysProbe);
    const ps = getComputedStyle(sysProbe);
    const system = { CanvasText: ps.color, Canvas: ps.backgroundColor, Highlight: ps.borderTopColor, HighlightText: ps.outlineColor, GrayText: ps.textDecorationColor };
    sysProbe.remove();
    const demo = (k) => q('[data-demo="' + k + '"]');
    const byText = (sel, text) => qa(sel).find((e) => e.textContent.trim() === text);
    const switches = qa('[role=switch]').filter((e) => !e.hasAttribute('data-disabled'));
    const swOff = switches.find((e) => !e.hasAttribute('data-checked'));
    swOff.scrollIntoView({ block: 'center' });
    await new Promise((r) => setTimeout(r, 150));
    const switchOff = { track: bg(swOff), thumb: bg(swOff.firstElementChild) };
    swOff.click();
    await new Promise((r) => setTimeout(r, 250));
    const switchOn = { track: bg(swOff), thumb: bg(swOff.firstElementChild) };
    swOff.click();
    await new Promise((r) => setTimeout(r, 250));
    const rOn = qa('[role=radio][data-checked]').find((e) => !e.hasAttribute('data-disabled'));
    const radio = { radio: bg(rOn), dot: bg(rOn?.firstElementChild) };
    const tabs = qa('[role=tab]').map((t) => parseFloat(getComputedStyle(t).borderBottomWidth));
    const toolbarActive = qa('a[aria-current=page]').find((a) => a.textContent.replace(/\\s/g, '').startsWith('첫째'));
    const toolbarTabs = toolbarActive ? [...toolbarActive.parentElement.children].map((t) => parseFloat(getComputedStyle(t).borderBottomWidth)) : [];
    const badgeEl = byText('span', 'info');
    const pulseEl = byText('span', '실행 중');
    const badge = { outline: badgeEl ? getComputedStyle(badgeEl).outline : null, outlineWidth: badgeEl ? getComputedStyle(badgeEl).outlineWidth : null, dot: pulseEl ? getComputedStyle(pulseEl, '::before').backgroundColor : null };
    const pagCur = q('[data-demo=pagination] button[aria-current=page]');
    const pagOther = qa('[data-demo=pagination] button:not([aria-current])')[1];
    const pagination = { bg: bg(pagCur), color: col(pagCur), fca: fca(pagCur), otherBorder: getComputedStyle(pagOther).borderTopColor };
    const td = q('[data-demo=table] tr[aria-selected=true] td');
    const table = { bg: bg(td), color: col(td), fca: fca(td) };
    const activeRow = byText('span, div', '선택된 행(isActive)')?.closest('li');
    const listRow = { bg: bg(activeRow), color: col(activeRow), fca: fca(activeRow) };
    const primary = byText('button', 'Primary');
    const button = { bg: bg(primary), color: col(primary), fca: fca(primary) };
    const markers = qa('[data-status]').filter((e) => getComputedStyle(e).borderRadius.startsWith('9999'));
    const marker = (s) => markers.find((e) => e.getAttribute('data-status') === s);
    const lineHost = marker('done')?.closest('li');
    const timeline = {
      line: lineHost ? getComputedStyle(lineHost, '::before').backgroundColor : null,
      done: bg(marker('done')), active: bg(marker('active')), pending: bg(marker('pending')),
      pendingOutline: marker('pending') ? getComputedStyle(marker('pending')).outlineWidth : null,
    };
    const skeletonEl = qa('span, div').find((e) => getComputedStyle(e).animationName.includes('skeleton'));
    const separatorEl = q('[role=separator], hr');
    const cardEl = q('main h2')?.parentElement;
    const cb = qa('[role=checkbox][data-checked]').find((e) => !e.hasAttribute('data-disabled')) ?? q('[role=checkbox][data-checked]');
    return JSON.stringify({
      active: matchMedia('(forced-colors: active)').matches,
      system, switchOff, switchOn, radio, tabs, toolbarTabs, badge, pagination, table, listRow, button, timeline,
      skeleton: bg(skeletonEl), separator: bg(separatorEl), card: cardEl ? getComputedStyle(cardEl).borderTopColor : null,
      checkbox: { box: bg(cb), icon: cb ? getComputedStyle(cb.querySelector('svg')).stroke : null },
    });
  })()`;
}
