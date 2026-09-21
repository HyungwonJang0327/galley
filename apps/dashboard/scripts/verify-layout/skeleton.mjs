// Skeleton 치수·모양·여러 줄·접근성 속성 실측.
// 갤러리(/design) Skeleton 섹션의 data-demo("skeleton-shapes"·"skeleton-lines"·"skeleton-card"·"skeleton-flex")에 결합되어 있다 —
// 갤러리를 바꾸면 여기도 맞춘다. 전제: shapes는 [sm 120×16, md 120×40, pill 40×40] 순서, lines는 lines={3} 하나,
// card는 aria-busy 부모 안에 원 아바타 + 제목(40%) + lines={2}, flex는 [space-5 원 아바타, 폭 없는 Skeleton, 버튼] 행.

export async function verifySkeleton(page) {
  const name = 'Skeleton 치수·모양·여러 줄';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 1;
  const checks = [
    [
      `숫자 width·height가 px로 잡힌다 (${m.shapes.map((s) => `${s.width}×${s.height}`).join(' · ')})`,
      near(m.shapes[0].width, 120) &&
        near(m.shapes[0].height, 16) &&
        near(m.shapes[1].width, 120) &&
        near(m.shapes[1].height, 40) &&
        near(m.shapes[2].width, 40) &&
        near(m.shapes[2].height, 40),
    ],
    [
      `radius sm < md < pill(원) (${m.shapes.map((s) => s.radius).join(' < ')})`,
      m.shapes[0].radius < m.shapes[1].radius && m.shapes[1].radius < m.shapes[2].radius,
    ],
    [
      `radius=pill 정사각형은 원이다 (반지름 ${m.shapes[2].radius} ≥ 변 절반 ${m.shapes[2].height / 2})`,
      m.shapes[2].radius >= m.shapes[2].height / 2,
    ],
    [
      `막대 색이 경계선 토큰과 같다 (${m.shapes[0].background} = ${m.borderColor})`,
      m.shapes[0].background === m.borderColor,
    ],
    ['막대에 펄스 애니메이션이 걸려 있다', m.shapes[0].animated],
    [
      `모든 Skeleton이 aria-hidden (${m.hiddenCount}/${m.totalCount})`,
      m.hiddenCount === m.totalCount,
    ],
    [`[lines] 막대 3개가 쌓인다 (${m.lines.count}개)`, m.lines.count === 3],
    [`[lines] 줄 간격이 space-2 (${m.lines.gap} = ${m.space2})`, near(m.lines.gap, m.space2)],
    [
      `[lines] 첫 줄은 부모 폭, 마지막 줄은 60% (${m.lines.firstWidth} / ${m.lines.lastWidth} of ${m.lines.parentWidth})`,
      near(m.lines.firstWidth, m.lines.parentWidth) &&
        near(m.lines.lastWidth, m.lines.parentWidth * 0.6),
    ],
    [
      `[lines] 줄 높이가 글자 높이(1em)다 (${m.lines.firstHeight} = ${m.lines.fontSize})`,
      near(m.lines.firstHeight, m.lines.fontSize),
    ],
    [
      `[flex 행] 폭 없는 Skeleton이 형제와 폭을 나눠 넘치지 않는다 (행 ${m.flex.scrollWidth} ≤ ${m.flex.clientWidth})`,
      m.flex.scrollWidth <= m.flex.clientWidth + 0.5,
    ],
    [
      `[flex 행] 폭 없는 막대 = 행 − 아바타 − 버튼 − 간격 2 (${m.flex.barWidth} ≈ ${m.flex.expectedBarWidth})`,
      near(m.flex.barWidth, m.flex.expectedBarWidth),
    ],
    [
      `[flex 행] 폭을 준 아바타는 눌리지 않는다 (${m.flex.avatarWidth} = ${m.space5})`,
      near(m.flex.avatarWidth, m.space5),
    ],
    ['[card] 부모가 aria-busy="true"이고 Skeleton은 role이 없다', m.card.busy && m.card.noRoles],
    [
      `[card] 아바타 원이 본문 첫 줄 위와 정렬된다 (차 ${m.card.avatarVsTitleTop})`,
      near(m.card.avatarVsTitleTop, 0),
    ],
    [
      `[card] 제목 폭이 본문 칸의 40% (${m.card.titleWidth} ≈ ${m.card.bodyWidth} × 0.4)`,
      near(m.card.titleWidth, m.card.bodyWidth * 0.4),
    ],
  ].map(([label, pass]) => ({ label, pass }));

  return { name, checks };
}

function measureExpression() {
  return `(async () => {
    const demo = (key) => document.querySelector('[data-demo="' + key + '"]');
    const shapes = demo('skeleton-shapes');
    const lines = demo('skeleton-lines');
    const card = demo('skeleton-card');
    const flex = demo('skeleton-flex');
    if (!shapes || !lines || !card || !flex) return JSON.stringify({ error: 'Skeleton 데모를 찾지 못함' });
    shapes.scrollIntoView({ block: 'center' });
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));
    const round = (n) => Math.round(n * 100) / 100;
    const px = (v) => parseFloat(v);
    const rootStyle = getComputedStyle(document.documentElement);
    // 토큰 값을 계산된 색으로 바꾸려면 어딘가에 적용해 읽어야 한다.
    const probe = document.createElement('div');
    probe.style.background = 'var(--ui-color-border)';
    document.body.appendChild(probe);
    const borderColor = getComputedStyle(probe).backgroundColor;
    probe.remove();

    const shapeEls = [...shapes.children];
    const shapeInfo = shapeEls.map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        width: round(rect.width),
        height: round(rect.height),
        radius: px(style.borderTopLeftRadius),
        background: style.backgroundColor,
        animated: style.animationName !== 'none' && px(style.animationDuration) > 0,
      };
    });

    // aria-hidden 집계: Skeleton 루트만 센다(여러 줄의 막대 span은 루트 안에 있으니 제외).
    // 루트 = shapes·lines의 직계 자식, card의 아바타, card 본문 칸의 자식들.
    const roots = [
      ...shapeEls,
      flex.children[0],
      flex.children[1],
      lines.firstElementChild,
      card.firstElementChild,
      ...card.lastElementChild.children,
    ];
    const hiddenCount = roots.filter((el) => el.getAttribute('aria-hidden') === 'true').length;

    const linesRoot = lines.firstElementChild;
    const bars = [...linesRoot.children];
    const firstRect = bars[0].getBoundingClientRect();
    const secondRect = bars[1].getBoundingClientRect();
    const lastRect = bars[bars.length - 1].getBoundingClientRect();

    const flexGap = px(getComputedStyle(flex).columnGap);
    const flexAvatar = flex.children[0].getBoundingClientRect();
    const flexBar = flex.children[1].getBoundingClientRect();
    const flexButton = flex.children[2].getBoundingClientRect();

    const avatar = card.firstElementChild.getBoundingClientRect();
    const body = card.lastElementChild;
    const title = body.firstElementChild.getBoundingClientRect();

    return JSON.stringify({
      borderColor,
      space2: px(rootStyle.getPropertyValue('--ui-space-2')),
      space5: px(rootStyle.getPropertyValue('--ui-space-5')),
      shapes: shapeInfo,
      totalCount: roots.length,
      hiddenCount,
      lines: {
        count: bars.length,
        gap: round(secondRect.top - firstRect.bottom),
        firstWidth: round(firstRect.width),
        lastWidth: round(lastRect.width),
        firstHeight: round(firstRect.height),
        parentWidth: round(lines.getBoundingClientRect().width),
        fontSize: px(getComputedStyle(linesRoot).fontSize),
      },
      flex: {
        scrollWidth: flex.scrollWidth,
        clientWidth: flex.clientWidth,
        barWidth: round(flexBar.width),
        expectedBarWidth: round(flex.clientWidth - flexAvatar.width - flexButton.width - flexGap * 2),
        avatarWidth: round(flexAvatar.width),
      },
      card: {
        busy: card.getAttribute('aria-busy') === 'true',
        noRoles: roots.every((el) => el.getAttribute('role') === null),
        avatarVsTitleTop: round(avatar.top - title.top),
        titleWidth: round(title.width),
        bodyWidth: round(body.getBoundingClientRect().width),
      },
    });
  })()`;
}
