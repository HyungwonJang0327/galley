// Tabs 키보드 이동 실측 — happy-dom에서 재현되지 않아(P7k) 실제 Chrome 키 입력으로 잰다.
// 갤러리(/design) Tabs 섹션 data-demo="tabs"에 결합되어 있다 — 전제: 탭 3개 [첫째(활성), 둘째, 셋째(disabled)], 첫째·둘째에 패널.
// galley-ui Tabs: activateOnFocus(포커스 = 활성), 끝에서 순환, disabled 탭은 포커스는 받되(aria-disabled, 발견 가능) 활성화되지 않는다 — 2026-11-14 Chrome 실측.

export async function verifyTabs(page) {
  const name = 'Tabs 키보드 이동';
  const center = JSON.parse(
    await page.evaluate(`(() => {
      const root = document.querySelector('[data-demo="tabs"]');
      if (!root) return JSON.stringify({ error: 'Tabs 데모를 찾지 못함' });
      root.scrollIntoView({ block: 'center' });
      const r = root.querySelector('[role=tab]').getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`),
  );
  if (center.error) return { name, checks: [{ label: center.error, pass: false }] };
  await page.mouseClick(center.x, center.y);
  const read = () =>
    page
      .evaluate(
        `(() => {
      const root = document.querySelector('[data-demo="tabs"]');
      const tabs = [...root.querySelectorAll('[role=tab]')];
      const active = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      const focused = tabs.find((t) => t === document.activeElement);
      const panel = root.querySelector('[role=tabpanel]');
      return JSON.stringify({
        active: active ? active.textContent.trim() : null,
        focused: focused ? focused.textContent.trim() : null,
        panel: panel ? panel.textContent.trim() : null,
        tabindex: tabs.map((t) => t.getAttribute('tabindex')).join(','),
        disabled: focused ? focused.getAttribute('aria-disabled') : null,
      });
    })()`,
      )
      .then(JSON.parse);
  const step = async (key) => {
    await page.pressKey(key);
    await new Promise((r) => setTimeout(r, 120));
    return read();
  };
  const start = await read();
  const right1 = await step('ArrowRight'); // 둘째 — 포커스와 함께 활성화
  const right2 = await step('ArrowRight'); // 셋째(disabled) — 포커스는 가되(발견 가능) 활성은 그대로
  const right3 = await step('ArrowRight'); // 첫째로 순환
  const end = await step('End'); // 마지막 탭(셋째, disabled) — 활성 그대로
  const home = await step('Home');
  const left = await step('ArrowLeft'); // 첫째에서 왼쪽 → 셋째로 순환

  const checks = [
    [
      `클릭으로 첫째 탭에 포커스·활성 (${start.focused} / ${start.active})`,
      start.focused === '첫째3' && start.active === '첫째3',
    ],
    [
      `ArrowRight → 둘째로 포커스·활성이 같이 움직이고 패널이 바뀐다(activateOnFocus) (${right1.focused} / ${right1.active} / ${right1.panel})`,
      right1.focused === '둘째0' && right1.active === '둘째0' && right1.panel === '둘째 탭 내용',
    ],
    [
      `ArrowRight → disabled 셋째는 포커스만 받고(aria-disabled) 활성은 둘째 그대로 (${right2.focused} / ${right2.active} / ${right2.disabled})`,
      right2.focused === '셋째' && right2.active === '둘째0' && right2.disabled === 'true',
    ],
    [
      `ArrowRight → 첫째로 순환·활성 (${right3.focused} / ${right3.active})`,
      right3.focused === '첫째3' && right3.active === '첫째3',
    ],
    [
      `End → 마지막 탭에 포커스, 활성은 그대로 (${end.focused} / ${end.active})`,
      end.focused === '셋째' && end.active === '첫째3',
    ],
    [
      `Home → 첫째 (${home.focused} / ${home.active})`,
      home.focused === '첫째3' && home.active === '첫째3',
    ],
    [`ArrowLeft(첫째에서) → 셋째로 순환 (${left.focused})`, left.focused === '셋째'],
    [`roving tabindex: 포커스 탭만 0 (${left.tabindex})`, left.tabindex === '-1,-1,0'],
  ].map(([label, pass]) => ({ label, pass }));
  // 되돌린다 — 뒤 모듈·스크린샷이 같은 상태를 보게.
  await step('Home');
  return { name, checks };
}
