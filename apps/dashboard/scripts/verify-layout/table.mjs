// Table 구조·접근성·토큰·정렬·고정 머리글·밀도·빈 표 실측.
// 갤러리(/design) Table 섹션의 data-demo("table"·"table-sortable"·"table-compact"·"table-sticky"·"table-empty")에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
// 전제: table은 4열(셋째 numeric)·4행(둘째 selected), sortable은 이름(asc 시작)·수가 정렬 가능, sticky는 12행이 max-height 안에서 스크롤, empty는 colSpan 4.

export async function verifyTable(page) {
  const name = 'Table 구조·접근성';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 1;
  const checks = [
    [
      `table[aria-label="기본 표"]에 columnheader 4개(scope=col)·본문 행 4개 (${m.headers}/${m.scopes}, ${m.bodyRows})`,
      m.label === '기본 표' && m.headers === 4 && m.scopes === 4 && m.bodyRows === 4,
    ],
    [
      `머리글 글자 xs 토큰·보조 색 (${m.thFontSize}px = ${m.textXs}px, ${m.thColor})`,
      near(m.thFontSize, m.textXs) && m.thColor === m.mutedColor,
    ],
    [
      `numeric 셀은 오른쪽 정렬·tabular-nums (${m.numericAlign}, ${m.numericVariant})`,
      (m.numericAlign === 'end' || m.numericAlign === 'right') &&
        /tabular-nums/.test(m.numericVariant),
    ],
    [
      `셀 아래 1px 경계선 = border 토큰, 마지막 행은 없음 (${m.cellBorder}, last ${m.lastBorderWidth})`,
      m.cellBorder === `1px solid ${m.borderColor}` && m.lastBorderWidth === 0,
    ],
    [
      `둘째 행 selected: aria-selected + accent-tint 배경 (${m.selectedBg})`,
      m.selectedAria === 'true' && m.selectedBg === m.accentTint,
    ],
    [
      `[sortable] aria-sort는 한 열(이름 ascending)·머리글은 버튼 (${m.sort.sorted.join(',')}, buttons ${m.sort.buttons})`,
      m.sort.sorted.length === 1 && m.sort.sorted[0] === '이름:ascending' && m.sort.buttons === 2,
    ],
    [
      `[sortable] "수"를 누르면 aria-sort가 수:ascending으로 옮겨가고 첫 행이 가장 작은 수 (${m.sort.afterClick.sorted.join(',')}, 첫 행 ${m.sort.afterClick.firstCount})`,
      m.sort.afterClick.sorted.length === 1 &&
        m.sort.afterClick.sorted[0] === '수:ascending' &&
        m.sort.afterClick.firstCount === '3',
    ],
    [
      `[sortable] 한 번 더 누르면 descending·첫 행이 가장 큰 수 (${m.sort.afterSecond.sorted.join(',')}, ${m.sort.afterSecond.firstCount})`,
      m.sort.afterSecond.sorted[0] === '수:descending' && m.sort.afterSecond.firstCount === '48',
    ],
    [
      `[sticky] 래퍼가 스크롤되고 머리글이 래퍼 위에 남는다 (scrollTop ${m.sticky.scrollTop} > 0, th top − wrap top = ${m.sticky.gap})`,
      m.sticky.scrollTop > 0 && Math.abs(m.sticky.gap) <= 1,
    ],
    [
      `[compact] sm 행 높이 < md 행 높이 (${m.compactRowHeight} < ${m.rowHeight})`,
      m.compactRowHeight < m.rowHeight,
    ],
    [
      `[empty] 셀 하나 colspan=4, 가운데 정렬 (${m.empty.colspan}, ${m.empty.align})`,
      m.empty.cells === 1 && m.empty.colspan === '4' && m.empty.align === 'center',
    ],
  ].map(([label, pass]) => ({ label, pass }));

  return { name, checks };
}

function measureExpression() {
  return `(async () => {
    const demo = (key) => document.querySelector('[data-demo="' + key + '"]');
    const root = demo('table');
    const sortable = demo('table-sortable');
    const compact = demo('table-compact');
    const sticky = demo('table-sticky');
    const empty = demo('table-empty');
    if (!root || !sortable || !compact || !sticky || !empty) return JSON.stringify({ error: 'Table 데모를 찾지 못함' });
    root.scrollIntoView({ block: 'center' });
    const settle = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)));
    await settle();
    const round = (n) => Math.round(n * 100) / 100;
    const px = (v) => parseFloat(v);
    const table = root.querySelector('table');
    const ths = [...table.querySelectorAll('thead th')];
    const bodyRows = [...table.querySelectorAll('tbody tr')];
    const probe = document.createElement('span');
    probe.style.fontSize = 'var(--ui-text-xs)';
    probe.style.color = 'var(--ui-color-text-muted)';
    probe.style.borderColor = 'var(--ui-color-border)';
    probe.style.backgroundColor = 'var(--ui-color-accent-tint)';
    probe.style.borderStyle = 'solid';
    document.body.appendChild(probe);
    const ps = getComputedStyle(probe);
    const tokens = { textXs: px(ps.fontSize), mutedColor: ps.color, borderColor: ps.borderTopColor, accentTint: ps.backgroundColor };
    probe.remove();
    const thStyle = getComputedStyle(ths[0]);
    const numericCell = bodyRows[0].querySelectorAll('td')[2];
    const numericStyle = getComputedStyle(numericCell);
    const firstCell = bodyRows[0].querySelector('td');
    const firstCellStyle = getComputedStyle(firstCell);
    const lastCellStyle = getComputedStyle(bodyRows[bodyRows.length - 1].querySelector('td'));
    const selectedRow = bodyRows[1];
    const selectedBg = getComputedStyle(selectedRow.querySelector('td')).backgroundColor;
    const rowHeight = round(bodyRows[0].getBoundingClientRect().height);
    const readSort = (t) => ({
      sorted: [...t.querySelectorAll('thead th[aria-sort]')].map((th) => th.textContent.trim() + ':' + th.getAttribute('aria-sort')),
      buttons: t.querySelectorAll('thead th button').length,
      firstCount: t.querySelector('tbody tr td:nth-child(3)').textContent.trim(),
    });
    const sTable = sortable.querySelector('table');
    const sortBefore = readSort(sTable);
    const countButton = [...sTable.querySelectorAll('thead th button')].find((b) => b.textContent.trim() === '수');
    countButton.click();
    await settle();
    const afterClick = readSort(sTable);
    countButton.click();
    await settle();
    const afterSecond = readSort(sTable);
    // 되돌린다(이름 asc) — 스크린샷·뒤 검사가 같은 상태를 보게.
    const nameButton = [...sTable.querySelectorAll('thead th button')].find((b) => b.textContent.trim() === '이름');
    nameButton.click();
    await settle();
    const wrap = sticky.querySelector('table').parentElement;
    wrap.scrollTop = wrap.scrollHeight;
    await settle();
    const stickyTh = sticky.querySelector('thead th');
    const stickyInfo = {
      scrollTop: round(wrap.scrollTop),
      gap: round(stickyTh.getBoundingClientRect().top - wrap.getBoundingClientRect().top),
    };
    wrap.scrollTop = 0;
    const compactRowHeight = round(compact.querySelector('tbody tr').getBoundingClientRect().height);
    const emptyCells = [...empty.querySelectorAll('tbody td')];
    const emptyStyle = getComputedStyle(emptyCells[0]);
    return JSON.stringify({
      label: table.getAttribute('aria-label'),
      headers: ths.length,
      scopes: ths.filter((th) => th.getAttribute('scope') === 'col').length,
      bodyRows: bodyRows.length,
      thFontSize: px(thStyle.fontSize),
      thColor: thStyle.color,
      numericAlign: numericStyle.textAlign,
      numericVariant: numericStyle.fontVariantNumeric,
      cellBorder: firstCellStyle.borderBottomWidth + ' ' + firstCellStyle.borderBottomStyle + ' ' + firstCellStyle.borderBottomColor,
      lastBorderWidth: px(lastCellStyle.borderBottomWidth),
      selectedAria: selectedRow.getAttribute('aria-selected'),
      selectedBg,
      rowHeight,
      sort: { ...sortBefore, afterClick, afterSecond },
      sticky: stickyInfo,
      compactRowHeight,
      empty: { cells: emptyCells.length, colspan: emptyCells[0].getAttribute('colspan'), align: emptyStyle.textAlign },
      ...tokens,
    });
  })()`;
}
