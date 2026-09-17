// RadioGroup 원·점 치수, 첫 줄 정렬, 긴 보조 말줄임, 라벨 클릭 선택 실측.
// 갤러리(/design) RadioGroup 데모의 그룹 aria-label("세로 라디오"·"가로 라디오")에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
// 항목 레이아웃은 Select·Menu와 ItemContent를 공유한다 — 그쪽 수정으로 원과 라벨 첫 줄 정렬이 깨지는 것을 여기서 잡는다.
import { join } from 'node:path';

const VERTICAL = '세로 라디오';
const HORIZONTAL = '가로 라디오';

export async function verifyRadio(page, { outDir }) {
  const name = 'RadioGroup 원·정렬·말줄임';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 0.5;
  const size = parseFloat(m.tokenSize);
  const { gap } = m.checked;
  const checks = [
    [
      `원 크기가 토큰과 같다 (${m.checked.radio.width}×${m.checked.radio.height} = ${m.tokenSize})`,
      near(m.checked.radio.width, size) && near(m.checked.radio.height, size),
    ],
    [
      `선택 점 사방 여백 대칭 (${gap.left}/${gap.right}/${gap.top}/${gap.bottom})`,
      near(gap.left, gap.right) && near(gap.top, gap.bottom) && near(gap.left, gap.top),
    ],
    [
      '원이 라벨 첫 줄에 맞는다(보조가 있어도 가운데로 내려오지 않음)',
      m.rows.every((row) => Math.abs(row.radioCenter - row.labelCenter) <= 1),
    ],
    ['긴 보조 텍스트가 말줄임된다(scrollWidth > clientWidth)', m.longDescription.truncated],
    [
      `긴 보조가 있어도 항목이 그룹 폭을 넘지 않는다 (${m.longDescription.itemWidth} ≤ ${m.longDescription.groupWidth})`,
      m.longDescription.itemWidth <= m.longDescription.groupWidth + 0.5,
    ],
    [
      `그룹이 좁은 flex 행 부모를 밀어내지 않는다 (${m.longDescription.groupWidth} ≤ ${m.longDescription.boxWidth})`,
      m.longDescription.groupWidth <= m.longDescription.boxWidth + 0.5,
    ],
    [
      '세로 항목은 내용 폭만큼만(빈 공간 클릭으로 선택되지 않게)',
      m.shortItemWidth < m.longDescription.groupWidth - 1,
    ],
    ['가로: 처음엔 미선택', m.horizontal.before.every((checked) => checked === 'false')],
    [
      '가로: 라벨 글자를 누르면 그 항목만 선택된다',
      m.horizontal.after.join() === ['false', 'true', 'false'].join(),
    ],
    ['disabled 항목은 눌러도 선택되지 않는다', m.disabledAfterClick === 'false'],
  ].map(([label, pass]) => ({ label, pass }));

  await page.screenshot(join(outDir, 'radio.png'));
  return { name, checks };
}

/** 세로 데모의 치수·정렬·말줄임을 재고, 가로 데모의 라벨을 눌러 선택을 확인하는 페이지 코드(JSON 문자열). */
function measureExpression() {
  return `(async () => {
    const group = (label) => document.querySelector('[role="radiogroup"][aria-label=' + JSON.stringify(label) + ']');
    const vertical = group(${JSON.stringify(VERTICAL)});
    const horizontal = group(${JSON.stringify(HORIZONTAL)});
    if (!vertical || !horizontal) return JSON.stringify({ error: 'RadioGroup 데모를 찾지 못함' });
    vertical.scrollIntoView({ block: 'center' });
    const settle = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));
    const round = (n) => Math.round(n * 100) / 100;
    await settle();

    const radios = [...vertical.querySelectorAll('[role="radio"]')];
    const labelOf = (radio) => document.getElementById(radio.getAttribute('aria-labelledby'));
    const rows = radios.map((radio) => {
      const a = radio.getBoundingClientRect();
      const b = labelOf(radio).getBoundingClientRect();
      return { radioCenter: round(a.top + a.height / 2), labelCenter: round(b.top + b.height / 2) };
    });

    const checkedRadio = radios.find((radio) => radio.getAttribute('aria-checked') === 'true');
    if (!checkedRadio || !checkedRadio.firstElementChild) return JSON.stringify({ error: '세로 데모에 선택된 항목(점)이 없음' });
    const outer = checkedRadio.getBoundingClientRect();
    const dot = checkedRadio.firstElementChild.getBoundingClientRect();

    // 가장 긴 보조 텍스트를 가진 항목으로 말줄임을 본다.
    const described = radios
      .map((radio) => ({ radio, el: document.getElementById(radio.getAttribute('aria-describedby') ?? '') }))
      .filter((entry) => entry.el);
    const longest = described.sort((x, y) => y.el.textContent.length - x.el.textContent.length)[0];
    if (!longest) return JSON.stringify({ error: '보조 텍스트가 있는 항목이 없음' });
    // 말줄임은 ItemContent의 보조 줄(설명 span의 부모)에 걸린다.
    const clipped = longest.el.parentElement;
    const shortest = described[described.length - 1];

    const disabledRadio = radios.find((radio) => radio.getAttribute('aria-disabled') === 'true');
    if (disabledRadio) labelOf(disabledRadio).click();

    const horizontalRadios = [...horizontal.querySelectorAll('[role="radio"]')];
    const before = horizontalRadios.map((radio) => radio.getAttribute('aria-checked'));
    labelOf(horizontalRadios[1]).click();
    await settle();
    const after = horizontalRadios.map((radio) => radio.getAttribute('aria-checked'));

    return JSON.stringify({
      tokenSize: getComputedStyle(document.documentElement).getPropertyValue('--ui-radio-size').trim(),
      checked: {
        radio: { width: round(outer.width), height: round(outer.height) },
        gap: {
          left: round(dot.left - outer.left),
          right: round(outer.right - dot.right),
          top: round(dot.top - outer.top),
          bottom: round(outer.bottom - dot.bottom),
        },
      },
      rows,
      longDescription: {
        truncated: clipped.scrollWidth > clipped.clientWidth,
        itemWidth: round(longest.radio.closest('label').getBoundingClientRect().width),
        groupWidth: round(vertical.getBoundingClientRect().width),
        boxWidth: round(vertical.parentElement.getBoundingClientRect().width),
      },
      shortItemWidth: round(shortest.radio.closest('label').getBoundingClientRect().width),
      horizontal: { before, after },
      disabledAfterClick: disabledRadio ? disabledRadio.getAttribute('aria-checked') : 'missing',
    });
  })()`;
}
