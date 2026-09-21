// useConfirm · useAwaitDialog 실측: 열림 → 포커스가 안으로 → Esc는 취소(false) → 확인은 danger 버튼(빨강 채움) → 결과 글자.
// 갤러리(/design) "useConfirm · useAwaitDialog" 섹션(data-demo="await-dialog", 버튼 "삭제 확인"·"이름 바꾸기",
// 결과 span data-demo="await-dialog-confirm-result"·"await-dialog-name-result")에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
import { join } from 'node:path';
import { sleep } from './cdp.mjs';

export async function verifyAwaitDialog(page, { outDir }) {
  const name = 'useConfirm · useAwaitDialog 열림·취소·확인';
  const checks = [];
  const add = (label, pass) => checks.push({ label, pass });

  const button = await locate(page, '삭제 확인');
  if (button.error) return { name, checks: [{ label: button.error, pass: false }] };

  // 1. 열기 — dialog가 뜨고 포커스가 안에 있다. 확인 버튼은 danger(빨강 채움), 취소가 앞.
  await page.mouseClick(button.x, button.y);
  await sleep(400);
  let m = await measure(page);
  add(
    `열면 role=dialog, 이름 "삭제할까요?" (${m.dialog?.label})`,
    m.dialog?.label === '삭제할까요?',
  );
  add('열린 동안 포커스가 dialog 안에 있다', m.dialog?.focusInside === true);
  add(
    `footer 버튼 순서 취소 → 삭제 (${m.dialog?.buttons.join(' → ')})`,
    m.dialog?.buttons.join(',') === '취소,삭제',
  );
  add(
    `확인 버튼 배경 = --ui-color-danger (${m.dialog?.confirmBg} = ${m.dangerFg})`,
    m.dialog?.confirmBg === m.dangerFg,
  );
  add(
    `확인 버튼 글자 = --ui-color-accent-fg (${m.dialog?.confirmColor} = ${m.accentFg})`,
    m.dialog?.confirmColor === m.accentFg,
  );
  await page.screenshot(join(outDir, 'await-dialog-1.png'));

  // 2. Esc → 닫히고 결과는 "취소"
  await page.pressKey('Escape');
  await sleep(400);
  m = await measure(page);
  add(`Esc로 닫힌다 (dialog ${m.dialog === null ? '없음' : '남음'})`, m.dialog === null);
  add(`Esc 결과는 취소 (${m.confirmResult})`, m.confirmResult === '취소');

  // 3. 다시 열어 확인 → "삭제함"
  await page.mouseClick(button.x, button.y);
  await sleep(400);
  m = await measure(page);
  if (m.dialog === null) {
    add('다시 열린다', false);
    return { name, checks };
  }
  add('다시 열린다', true);
  await page.mouseClick(m.dialog.confirmCenter.x, m.dialog.confirmCenter.y);
  await sleep(400);
  m = await measure(page);
  add(
    `확인 뒤 닫히고 결과는 삭제함 (${m.confirmResult})`,
    m.dialog === null && m.confirmResult === '삭제함',
  );

  // 4. 이름 입력 — 값을 돌려받는다
  const rename = await locate(page, '이름 바꾸기');
  await page.mouseClick(rename.x, rename.y);
  await sleep(400);
  m = await measure(page);
  add(`이름 dialog "새 이름" (${m.dialog?.label})`, m.dialog?.label === '새 이름');
  await page.evaluate(`(() => {
    const input = document.querySelector('[role="dialog"] input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '바뀐 이름');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await sleep(200);
  m = await measure(page);
  const save = m.dialog?.buttonCenters['저장'];
  if (save) await page.mouseClick(save.x, save.y);
  await sleep(400);
  m = await measure(page);
  add(
    `저장하면 입력값이 돌아온다 (${m.nameResult})`,
    m.dialog === null && m.nameResult === '바뀐 이름',
  );
  await page.screenshot(join(outDir, 'await-dialog-2.png'));

  return { name, checks };
}

async function locate(page, label) {
  return JSON.parse(
    await page.evaluate(`(() => {
      const demo = document.querySelector('[data-demo="await-dialog"]');
      if (!demo) return JSON.stringify({ error: 'useConfirm 데모를 찾지 못함' });
      demo.scrollIntoView({ block: 'center' });
      const button = [...demo.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
      if (!button) return JSON.stringify({ error: '버튼 없음: ' + ${JSON.stringify(label)} });
      const r = button.getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`),
  );
}

async function measure(page) {
  return JSON.parse(
    await page.evaluate(`(() => {
      const rootStyle = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      document.body.append(probe);
      const resolveColor = (token) => {
        probe.style.color = rootStyle.getPropertyValue(token);
        return getComputedStyle(probe).color;
      };
      const dangerFg = resolveColor('--ui-color-danger');
      const accentFg = resolveColor('--ui-color-accent-fg');
      probe.remove();
      const el = document.querySelector('[role="dialog"]');
      let dialog = null;
      if (el) {
        const footerButtons = [...el.querySelectorAll('button:not([aria-label])')];
        const centers = {};
        for (const b of footerButtons) {
          const r = b.getBoundingClientRect();
          centers[b.textContent.trim()] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
        const confirm = footerButtons.at(-1);
        dialog = {
          label: document.getElementById(el.getAttribute('aria-labelledby'))?.textContent ?? '',
          focusInside: el.contains(document.activeElement),
          buttons: footerButtons.map((b) => b.textContent.trim()),
          buttonCenters: centers,
          confirmBg: confirm ? getComputedStyle(confirm).backgroundColor : '',
          confirmColor: confirm ? getComputedStyle(confirm).color : '',
          confirmCenter: confirm ? centers[confirm.textContent.trim()] : null,
        };
      }
      const text = (sel) => document.querySelector(sel)?.textContent.trim() ?? '';
      return JSON.stringify({
        dangerFg,
        accentFg,
        dialog,
        confirmResult: text('[data-demo="await-dialog-confirm-result"]'),
        nameResult: text('[data-demo="await-dialog-name-result"]'),
      });
    })()`),
  );
}
