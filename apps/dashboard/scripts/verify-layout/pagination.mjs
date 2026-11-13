// Pagination 구조·접근성·크기·클릭 이동 실측.
// 갤러리(/design) Pagination 섹션의 data-demo("pagination"·"pagination-short"·"pagination-disabled")에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
// 전제: pagination은 24쪽 중 12쪽(쪽 버튼 1 · 11 · 12 · 13 · 24 + 이전·다음 = 7, 생략 2), pagination-short는 5쪽 중 1쪽, pagination-disabled는 전부 비활성.

export async function verifyPagination(page) {
  const name = 'Pagination 구조·접근성';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 1;
  const checks = [
    [
      `nav[aria-label="페이지 이동"] 안 버튼 7개(이전·쪽 5·다음) + 생략 2개 (${m.buttons}/${m.ellipses})`,
      m.navLabel === '페이지 이동' && m.buttons === 7 && m.ellipses === 2,
    ],
    [`보이는 순서 ‹ 1 … 11 12 13 … 24 › (${m.sequence})`, m.sequence === '‹ 1 … 11 12 13 … 24 ›'],
    [
      `현재(12)만 aria-current="page", 접근성 이름 "12페이지" (${m.currentCount}, "${m.currentName}")`,
      m.currentCount === 1 && m.currentName === '12페이지',
    ],
    [
      `생략 기호는 aria-hidden (${m.hiddenEllipses}/${m.ellipses})`,
      m.hiddenEllipses === m.ellipses,
    ],
    [
      `버튼 높이가 컨트롤 토큰과 같고 정사각 이상 (${m.buttonHeight} = ${m.controlHeight}, 폭 ${m.buttonWidth})`,
      near(m.buttonHeight, m.controlHeight) && m.buttonWidth >= m.controlHeight - 1,
    ],
    [
      `현재 쪽 배경 = --ui-color-accent, 글자 = accent-fg (${m.currentBg} / ${m.currentFg})`,
      m.currentBg === m.accent && m.currentFg === m.accentFg,
    ],
    [`항목이 한 줄에 놓인다 (top 차 ${m.topSpread})`, m.topSpread <= 1],
    [
      `13을 누르면 현재가 13으로 옮겨가고 폭이 그대로 (${m.afterClick.current}, 버튼 ${m.afterClick.buttons})`,
      m.afterClick.current === '13' && m.afterClick.buttons === 7,
    ],
    [
      `[short] 5개 쪽 버튼, 생략 없음, 첫 쪽이라 이전 비활성·다음 활성 (${m.short.pages}/${m.short.ellipses}, prev ${m.short.prevDisabled}, next ${m.short.nextDisabled})`,
      m.short.pages === 5 &&
        m.short.ellipses === 0 &&
        m.short.prevDisabled &&
        !m.short.nextDisabled,
    ],
    [
      `[disabled] 버튼 전부 비활성 (${m.disabled.disabledCount}/${m.disabled.total})`,
      m.disabled.total > 0 && m.disabled.disabledCount === m.disabled.total,
    ],
  ].map(([label, pass]) => ({ label, pass }));

  return { name, checks };
}

function measureExpression() {
  return `(async () => {
    const demo = (key) => document.querySelector('[data-demo="' + key + '"]');
    const root = demo('pagination');
    const shortDemo = demo('pagination-short');
    const disabledDemo = demo('pagination-disabled');
    if (!root || !shortDemo || !disabledDemo) return JSON.stringify({ error: 'Pagination 데모를 찾지 못함' });
    root.scrollIntoView({ block: 'center' });
    // 색 전환(--ui-duration-fast 120ms)이 끝난 뒤 읽는다 — 진행 중에 재면 accent의 98% 같은 중간값이 나온다.
    const settle = async () => {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)));
      await Promise.all(root.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})));
    };
    await settle();
    const round = (n) => Math.round(n * 100) / 100;
    const px = (v) => parseFloat(v);
    const nav = root.querySelector('nav');
    const read = (n) => {
      const items = [...n.querySelectorAll('li')];
      return items.map((li) => {
        const b = li.querySelector('button');
        if (!b) return '…';
        const label = b.getAttribute('aria-label') || '';
        if (label.startsWith('이전') || label.startsWith('Previous')) return '‹';
        if (label.startsWith('다음') || label.startsWith('Next')) return '›';
        return b.textContent.trim();
      }).join(' ');
    };
    const buttons = [...nav.querySelectorAll('button')];
    const ellipses = [...nav.querySelectorAll('span')].filter((s) => s.textContent.trim() === '…');
    const current = nav.querySelector('[aria-current="page"]');
    const currentStyle = getComputedStyle(current);
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--ui-color-accent)';
    probe.style.color = 'var(--ui-color-accent-fg)';
    probe.style.height = 'var(--ui-control-height)';
    probe.style.display = 'block';
    document.body.appendChild(probe);
    const ps = getComputedStyle(probe);
    const accent = ps.backgroundColor;
    const accentFg = ps.color;
    const controlHeight = px(ps.height);
    probe.remove();
    const tops = [...nav.querySelectorAll('li')].map((li) => round(li.getBoundingClientRect().top));
    const rect = current.getBoundingClientRect();
    const sequence = read(nav);
    const target = buttons.find((b) => b.textContent.trim() === '13');
    target.click();
    await settle();
    const after = nav.querySelector('[aria-current="page"]');
    const afterClick = { current: after ? after.textContent.trim() : null, buttons: nav.querySelectorAll('button').length };
    // 되돌린다 — 뒤의 검사·스크린샷이 같은 상태를 보게.
    const back = [...nav.querySelectorAll('button')].find((b) => b.textContent.trim() === '12');
    if (back) { back.click(); await settle(); }
    const sNav = shortDemo.querySelector('nav');
    const sButtons = [...sNav.querySelectorAll('button')];
    const byLabel = (list, prefix) => list.find((b) => (b.getAttribute('aria-label') || '').startsWith(prefix));
    const dButtons = [...disabledDemo.querySelectorAll('button')];
    return JSON.stringify({
      navLabel: nav.getAttribute('aria-label'),
      buttons: buttons.length,
      ellipses: ellipses.length,
      hiddenEllipses: ellipses.filter((s) => s.getAttribute('aria-hidden') === 'true').length,
      sequence,
      currentCount: nav.querySelectorAll('[aria-current="page"]').length,
      currentName: current.getAttribute('aria-label'),
      buttonHeight: round(rect.height),
      buttonWidth: round(rect.width),
      controlHeight,
      currentBg: currentStyle.backgroundColor,
      currentFg: currentStyle.color,
      accent,
      accentFg,
      topSpread: round(Math.max(...tops) - Math.min(...tops)),
      afterClick,
      short: {
        pages: sButtons.filter((b) => /^\\d+$/.test(b.textContent.trim())).length,
        ellipses: [...sNav.querySelectorAll('span')].filter((s) => s.textContent.trim() === '…').length,
        prevDisabled: byLabel(sButtons, 'Previous').disabled,
        nextDisabled: byLabel(sButtons, 'Next').disabled,
      },
      disabled: { total: dButtons.length, disabledCount: dButtons.filter((b) => b.disabled).length },
    });
  })()`;
}
