// Form·FormField 컨트롤 폭·오류 테두리·라벨 클릭 포커스·제출 검증(인라인 오류) 실측.
// 갤러리(/design)의 form[aria-label="폼 필드 데모"], 컨트롤 name(name·email·note·choice·enabled),
// [data-demo="form-submit-count"]에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
// 전부 happy-dom이 못 보는 것들이다(레이아웃·포커스·네이티브 제출 검증).
import { join } from 'node:path';

export async function verifyFormField(page, { outDir }) {
  const name = 'Form·FormField 폭·오류·제출 검증';
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
    ['Form은 브라우저 말풍선을 끈다(noValidate)', m.noValidate],
    [
      `Form errors가 같은 name의 필드에 뜬다 (${JSON.stringify(m.serverError)})`,
      m.serverError !== '',
    ],
    ['Select에서 옵션을 고르면 앱 오류가 지워진다', m.selectErrorAfterPick === ''],
    ['Form errors는 그 필드 값을 바꾸면 지워진다', m.serverErrorAfterChange === ''],
    [
      `빈 채 제출하면 핸들러가 안 불린다 (${m.submit.blockedCount}) · 빈 칸으로 포커스`,
      m.submit.blockedCount === 0 && m.submit.focusedName === 'name',
    ],
    [
      `오류가 필드 아래에 인라인으로 뜨고 칸이 오류 테두리가 된다 (${JSON.stringify(m.submit.inlineError)})`,
      m.submit.inlineError !== '' && m.submit.invalidBorder === m.errorBorder,
    ],
    [
      '값을 채우면 오류가 지워지고 테두리가 돌아온다',
      m.submit.errorAfterFill === '' && m.submit.borderAfterFill === m.normalBorder,
    ],
    [`오류를 모두 풀고 제출하면 통과한다 (${m.submit.passedCount})`, m.submit.passedCount === 1],
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

    const regionOf = (el) => fieldOf(el).querySelector('[aria-live]');
    // 제출 전에 잰다 — 제출 뒤에는 이름 칸도 오류가 된다.
    const normalBorder = getComputedStyle(input).borderTopColor;
    const errorBorder = getComputedStyle(textarea).borderTopColor;
    const emptyRegionHeight = regionOf(input).getBoundingClientRect().height;
    const email = form.querySelector('input[name="email"]');
    const serverError = email ? regionOf(email).textContent : '';

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
    const inlineError = regionOf(input).textContent;
    const invalidBorder = getComputedStyle(input).borderTopColor;

    // React 제어형 입력: native setter로 값을 넣고 input 이벤트를 보낸다.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '값');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    const errorAfterFill = regionOf(input).textContent;
    const borderAfterFill = getComputedStyle(input).borderTopColor;
    // 오류가 남은 필드는 제출을 막는다 — 메모(앱 error)는 값을 넣어 앱이 지우게, 이메일(Form errors)은 값을 바꿔 지운다.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, '메모');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    if (email) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(email, 'free@example.com');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // 선택(앱 error)은 옵션을 하나 골라 지운다. Base UI Select는 pointer 이벤트로 열린다.
    const fire = (el, type) =>
      el.dispatchEvent(new (type.startsWith('pointer') ? PointerEvent : MouseEvent)(type, { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0 }));
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(trigger, type);
    let option = null;
    for (let i = 0; i < 20 && !option; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const listbox = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
      option = listbox?.querySelector('[role="option"]') ?? null;
    }
    // 못 열었으면 여기서 멈춘다 — 그냥 가면 뒤 검사 둘이 원인 표시 없이 같이 실패한다.
    // (합성 pointer 시퀀스는 select.mjs와 같은 방식 — Base UI가 바뀌면 그쪽도 같이 깨진다.)
    if (!option) return JSON.stringify({ error: 'Select 옵션을 열지 못함(폼 필드 데모의 선택 필드)' });
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) fire(option, type);
    await settle();
    const serverErrorAfterChange = email ? regionOf(email).textContent : '';
    submit.click();
    await settle();

    return JSON.stringify({
      noValidate: form.noValidate,
      serverError,
      serverErrorAfterChange,
      selectErrorAfterPick: regionOf(trigger).textContent,
      fill,
      switchWidth: width(switchEl.closest('label')),
      switchFieldWidth: width(fieldOf(switchEl)),
      errorBorder,
      normalBorder,
      emptyRegionHeight,
      labelFocus: { input: inputFocused, textarea: textareaFocused },
      required: input.required,
      submit: {
        blockedCount,
        focusedName,
        inlineError,
        invalidBorder,
        errorAfterFill,
        borderAfterFill,
        passedCount: count(),
      },
    });
  })()`;
}
