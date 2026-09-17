// InlineAlert 아이콘 정렬·action 배치·줄바꿈·role·plain 실측.
// 갤러리(/design) InlineAlert 섹션의 data-demo("alert-tones"·"alert-multiline"·"alert-plain")에 결합되어 있다 —
// 갤러리를 바꾸면 여기도 맞춘다. 전제: tones는 info·success·warning·danger 순서, multiline은 제목+여러 줄 본문+action,
// plain 묶음의 마지막은 목록 행(ListRow) 안에 놓인 알림.

export async function verifyInlineAlert(page) {
  const name = 'InlineAlert 정렬·배치·role';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 1;
  const checks = [
    [
      `tone 순서대로 live 영역 role이 status·status·alert·alert (${m.roles.join('·')})`,
      m.roles.join() === 'status,status,alert,alert',
    ],
    [
      '상자(루트)에는 role이 없다 — live 영역은 제목+본문만',
      m.rootRoles.every((role) => role === null),
    ],
    ['filled는 tone마다 배경색이 다르다', new Set(m.backgrounds).size === 4],
    [
      `[여러 줄] 아이콘이 첫 줄(제목) 세로 가운데 (차 ${m.multi.iconVsFirstLine})`,
      near(m.multi.iconVsFirstLine, 0),
    ],
    [`[여러 줄] 본문이 여러 줄로 접힌다 (${m.multi.bodyLines}줄)`, m.multi.bodyLines >= 2],
    ['[여러 줄] action이 live 영역 밖에 있다', m.multi.actionOutsideLive],
    [
      `[여러 줄] action이 오른쪽 끝에 붙는다 (여백 ${m.multi.actionRightGap} = padding ${m.multi.paddingRight})`,
      near(m.multi.actionRightGap, m.multi.paddingRight),
    ],
    ['[여러 줄] action 폭이 눌리지 않는다(내용 폭 그대로)', m.multi.actionNotSquashed],
    ['[여러 줄] 상자가 부모 폭을 넘지 않는다', m.multi.boxWidth <= m.multi.parentWidth + 0.5],
    ['[plain] 배경·여백이 없다', m.plain.transparent && m.plain.padding === 0],
    [
      `[plain] 글자가 tone 색이다 (${m.plain.color} = ${m.plain.iconColor})`,
      m.plain.color === m.plain.iconColor,
    ],
    [
      `[plain] 목록 행 안에서 행 높이를 늘리지 않는다 (${m.plain.rowHeight} ≤ ${m.plain.plainRowBaseline})`,
      m.plain.rowHeight <= m.plain.plainRowBaseline + 1,
    ],
  ].map(([label, pass]) => ({ label, pass }));

  return { name, checks };
}

function measureExpression() {
  return `(async () => {
    const demo = (key) => document.querySelector('[data-demo="' + key + '"]');
    const tones = demo('alert-tones');
    const multi = demo('alert-multiline');
    const plain = demo('alert-plain');
    if (!tones || !multi || !plain) return JSON.stringify({ error: 'InlineAlert 데모를 찾지 못함' });
    tones.scrollIntoView({ block: 'center' });
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));
    const round = (n) => Math.round(n * 100) / 100;
    const live = (root) => root.querySelector('[role="alert"],[role="status"]');

    const toneRoots = [...tones.children];
    const box = multi.firstElementChild;
    const boxLive = live(box);
    const icon = box.querySelector('svg').getBoundingClientRect();
    const firstLine = boxLive.firstElementChild.getBoundingClientRect();
    const message = boxLive.lastElementChild;
    const lineHeight = parseFloat(getComputedStyle(message).lineHeight);
    const button = box.querySelector('button');
    const actionRect = button.parentElement.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();

    const plainRoot = plain.firstElementChild;
    const plainStyle = getComputedStyle(plainRoot);
    // 행 안 알림: 같은 목록 구조에서 알림이 없는 행과 높이를 비교할 대상이 없어, 알림을 잠깐 숨겨 기준 높이를 잰다.
    const row = plain.querySelector('li') ?? plain.lastElementChild.firstElementChild;
    const rowAlert = live(row).parentElement;
    const rowHeight = row.getBoundingClientRect().height;
    rowAlert.style.display = 'none';
    const plainRowBaseline = row.getBoundingClientRect().height;
    rowAlert.style.display = '';

    return JSON.stringify({
      roles: toneRoots.map((root) => live(root)?.getAttribute('role') ?? null),
      rootRoles: toneRoots.map((root) => root.getAttribute('role')),
      backgrounds: toneRoots.map((root) => getComputedStyle(root).backgroundColor),
      multi: {
        iconVsFirstLine: round(icon.top + icon.height / 2 - (firstLine.top + firstLine.height / 2)),
        bodyLines: Math.round(message.getBoundingClientRect().height / lineHeight),
        actionOutsideLive: !boxLive.contains(button),
        actionRightGap: round(boxRect.right - actionRect.right),
        paddingRight: parseFloat(getComputedStyle(box).paddingRight),
        actionNotSquashed: button.scrollWidth <= button.clientWidth + 1,
        boxWidth: round(boxRect.width),
        parentWidth: round(multi.getBoundingClientRect().width),
      },
      plain: {
        transparent: ['rgba(0, 0, 0, 0)', 'transparent'].includes(plainStyle.backgroundColor),
        padding: parseFloat(plainStyle.paddingTop) + parseFloat(plainStyle.paddingLeft),
        color: plainStyle.color,
        iconColor: getComputedStyle(plainRoot.querySelector('svg').parentElement).color,
        rowHeight: round(rowHeight),
        plainRowBaseline: round(plainRowBaseline),
      },
    });
  })()`;
}
