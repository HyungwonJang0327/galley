// FormField 컨트롤 폭·오류 테두리·라벨 클릭 포커스·required 제출 차단 실측.
// 갤러리(/design)의 form[aria-label="폼 필드 데모"], 컨트롤 name(name·note·choice·enabled), [data-demo="form-submit-count"]에
// 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다. 전부 happy-dom이 못 보는 것들이다(레이아웃·포커스·네이티브 제출 검증).
import { join } from 'node:path';

export async function verifyFormField(page, { outDir }) {
  const name = 'FormField 폭·오류·required';
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) return { name, checks: [{ label: m.error, pass: false }] };

  const near = (a, b) => Math.abs(a - b) <= 1;
  const checks = [
    ...m.fill.map((row) => [
      `${row.control} 폭 = 필드 폭 (${row.controlWidth} = ${row.fieldWidth})`,
      near(row.controlWidth, row.fieldWidth),
    ]),
    [
      `Switch는 내용 폭만큼만 (${m.switchWidth} < ${m.switchFieldWidth})`,
      m.switchWidth < m.switchFieldWidth - 1,
    ],
    [
      `오류 필드의 테두리 색이 정상 필드와 다르다 (${m.errorBorder} ≠ ${m.normalBorder})`,
      m.errorBorder !== m.normalBorder,
    ],
    ['오류 없는 필드의 live 영역은 높이 0(간격을 차지하지 않는다)', m.emptyRegionHeight === 0],
    ['라벨을 누르면 Input이 포커스를 받는다', m.labelFocus.input],
    ['라벨을 누르면 Textarea가 포커스를 받는다', m.labelFocus.textarea],
    ['필드의 required를 Input이 물려받는다', m.required],
    [
      `빈 채 제출하면 브라우저가 막는다 (${m.submit.blockedCount}) · 빈 칸으로 포커스`,
      m.submit.blockedCount === 0 && m.submit.focusedName === 'name',
    ],
    [`채우고 제출하면 통과한다 (${m.submit.passedCount})`, m.submit.passedCount === 1],
  ].map(([label, pass]) => ({ label, pass }));

  await page.screenshot(join(outDir, 'form-field.png'));
  return { name, checks };
}

/** 폼 데모의 폭·색을 재고, 라벨 클릭과 제출을 차례로 해 보는 페이지 코드(JSON 문자열). */
function measureExpression() {
  return `(async () => {
    const form = document.querySelector('form[aria-label="폼 필드 데모"]');
    const counter = form?.querySelector('[data-demo="form-submit-count"]');
    if (!form || !counter) return JSON.stringify({ error: 'FormField 데모를 찾지 못함' });
    form.scrollIntoView({ block: 'center' });
    const settle = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200)));
    const round = (n) => Math.round(n * 100) / 100;
    const width = (el) => round(el.getBoundingClientRect().width);
    await settle();

    const input = form.querySelector('input[name="name"]');
    const textarea = form.querySelector('textarea[name="note"]');
    const trigger = form.querySelector('[role="combobox"]');
    const switchEl = form.querySelector('[role="switch"]');
    if (!input || !textarea || !trigger || !switchEl) return JSON.stringify({ error: 'FormField 데모 컨트롤을 찾지 못함' });
    // 필드 루트 = 라벨(label[for])의 부모.
    const fieldOf = (el) => {
      const labelId = el.getAttribute('aria-labelledby');
      return document.getElementById(labelId).parentElement;
    };
    const labelOf = (el) => document.getElementById(el.getAttribute('aria-labelledby'));

    const fill = [['Input', input], ['Textarea', textarea], ['Select 트리거', trigger]].map(([control, el]) => ({
      control,
      controlWidth: width(el),
      fieldWidth: width(fieldOf(el)),
    }));

    labelOf(input).click();
    const inputFocused = document.activeElement === input;
    labelOf(textarea).click();
    const textareaFocused = document.activeElement === textarea;
    document.activeElement.blur();

    const count = () => Number(counter.textContent.replace(/\\D/g, ''));
    const submit = form.querySelector('button[type="submit"]');
    submit.click();
    await settle();
    const blockedCount = count();
    const focusedName = document.activeElement.getAttribute('name');

    // React 제어형 입력: native setter로 값을 넣고 input 이벤트를 보낸다.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '값');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    submit.click();
    await settle();

    return JSON.stringify({
      fill,
      switchWidth: width(switchEl.closest('label')),
      switchFieldWidth: width(fieldOf(switchEl)),
      errorBorder: getComputedStyle(textarea).borderTopColor,
      normalBorder: getComputedStyle(input).borderTopColor,
      emptyRegionHeight: fieldOf(input).querySelector('[aria-live]').getBoundingClientRect().height,
      labelFocus: { input: inputFocused, textarea: textareaFocused },
      required: input.required,
      submit: { blockedCount, focusedName, passedCount: count() },
    });
  })()`;
}
