// Breadcrumb 구조·접근성·한 줄 배치 실측.
// 갤러리(/design) Breadcrumb 섹션의 data-demo("breadcrumb"·"breadcrumb-header")에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
// 전제: breadcrumb은 [홈(링크), 설정(글자), 모델·비용(현재)] 3항목, breadcrumb-header는 PageHeader eyebrow에 2항목 + h1.

export async function verifyBreadcrumb(page) {
  const name = 'Breadcrumb 구조·접근성';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 1;
  const checks = [
    [
      `nav[aria-label="현재 위치"] 안 ol에 항목 3개 (${m.count})`,
      m.navLabel === '현재 위치' && m.count === 3,
    ],
    [
      `첫 항목은 링크(href="/"), 둘째는 글자, 셋째만 aria-current="page" (${m.kinds.join(' · ')})`,
      m.kinds[0] === 'link' &&
        m.kinds[1] === 'text' &&
        m.kinds[2] === 'current' &&
        m.currentCount === 1,
    ],
    [
      `구분 기호 2개, 전부 aria-hidden (${m.separators}/${m.hiddenSeparators})`,
      m.separators === 2 && m.hiddenSeparators === 2,
    ],
    [`항목이 한 줄에 놓인다 (top 차 ${m.topSpread})`, m.topSpread <= 1],
    [
      `글자 크기가 sm 토큰이고 현재 항목이 본문 색·중간 굵기 (${m.fontSize}px, weight ${m.currentWeight})`,
      near(m.fontSize, m.textSm) && m.currentWeight >= 500 && m.currentColor === m.textColor,
    ],
    [
      `[header] eyebrow가 h1 위에 있고 같은 왼쪽 정렬 (eyebrow bottom ${m.header.eyebrowBottom} ≤ h1 top ${m.header.h1Top}, left 차 ${m.header.leftDiff})`,
      m.header.eyebrowBottom <= m.header.h1Top + 0.5 && near(m.header.leftDiff, 0),
    ],
    [
      `[header] 액션은 h1·eyebrow 묶음과 같은 header 안에 오른쪽 (${m.header.actionsRight} ≥ ${m.header.h1Right})`,
      m.header.actionsRight >= m.header.h1Right,
    ],
  ].map(([label, pass]) => ({ label, pass }));

  return { name, checks };
}

function measureExpression() {
  return `(async () => {
    const demo = (key) => document.querySelector('[data-demo="' + key + '"]');
    const root = demo('breadcrumb');
    const headerDemo = demo('breadcrumb-header');
    if (!root || !headerDemo) return JSON.stringify({ error: 'Breadcrumb 데모를 찾지 못함' });
    root.scrollIntoView({ block: 'center' });
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 100)));
    const round = (n) => Math.round(n * 100) / 100;
    const px = (v) => parseFloat(v);
    const nav = root.querySelector('nav');
    const items = [...nav.querySelectorAll("ol > li")];
    const kinds = items.map((li) => {
      if (li.querySelector('[aria-current="page"]')) return 'current';
      if (li.querySelector('a')) return 'link';
      return 'text';
    });
    const separators = [...nav.querySelectorAll('svg')];
    const tops = items.map((li) => round(li.getBoundingClientRect().top));
    const current = nav.querySelector('[aria-current="page"]');
    const currentStyle = getComputedStyle(current);
    const probe = document.createElement('span');
    probe.style.color = 'var(--ui-color-text)';
    probe.style.fontSize = 'var(--ui-text-sm)';
    document.body.appendChild(probe);
    const textColor = getComputedStyle(probe).color;
    const textSm = px(getComputedStyle(probe).fontSize);
    probe.remove();
    const header = headerDemo.querySelector('header');
    const h1 = header.querySelector('h1');
    const eyebrow = header.querySelector('nav');
    const actions = header.querySelector('button');
    const h1Rect = h1.getBoundingClientRect();
    const eyebrowRect = eyebrow.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return JSON.stringify({
      navLabel: nav.getAttribute('aria-label'),
      count: items.length,
      kinds,
      currentCount: nav.querySelectorAll('[aria-current="page"]').length,
      separators: separators.length,
      hiddenSeparators: separators.filter((s) => s.getAttribute('aria-hidden') === 'true').length,
      topSpread: round(Math.max(...tops) - Math.min(...tops)),
      fontSize: px(getComputedStyle(nav).fontSize),
      textSm,
      currentWeight: Number(currentStyle.fontWeight),
      currentColor: currentStyle.color,
      textColor,
      header: {
        eyebrowBottom: round(eyebrowRect.bottom),
        h1Top: round(h1Rect.top),
        leftDiff: round(eyebrowRect.left - h1Rect.left),
        actionsRight: round(actionsRect.right),
        h1Right: round(h1Rect.right),
      },
    });
  })()`;
}
