// Switch 토글 횟수·손잡이 여백 실측.
// 갤러리(/design) Switch 데모의 라벨 문구와 [data-demo="switch-count"]에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다.
// happy-dom은 label 활성화 순서가 브라우저와 달라 "클릭 한 번 = 토글 한 번"을 단위 테스트로 못 잡는다. 여기서 잡는다.
import { join } from 'node:path';

const LABEL = '스위치 항목';
const DISABLED_LABEL = '비활성(꺼짐)';

export async function verifySwitch(page, { outDir }) {
  const m = JSON.parse(await page.evaluate(measureExpression()));
  if (m.error) {
    return { name: 'Switch 토글·손잡이', checks: [{ label: m.error, pass: false }] };
  }
  const near = (a, b) => Math.abs(a - b) <= 0.5;
  const checks = [
    ['초기: 꺼짐 · 토글 0회', m.initial.checked === 'false' && m.initial.count === 0],
    [
      '트랙 클릭 한 번 = 토글 1회 · 켜짐',
      m.afterTrack.checked === 'true' && m.afterTrack.count === 1,
    ],
    [
      '라벨 클릭 한 번 = 토글 1회 더 · 꺼짐',
      m.afterLabel.checked === 'false' && m.afterLabel.count === 2,
    ],
    [
      `트랙 크기가 토큰과 같다 (${m.initial.track.width}×${m.initial.track.height} = ${m.tokenWidth}×${m.tokenHeight})`,
      near(m.initial.track.width, parseFloat(m.tokenWidth)) &&
        near(m.initial.track.height, parseFloat(m.tokenHeight)),
    ],
    [
      `꺼짐 왼쪽 여백 = 켜짐 오른쪽 여백 (${m.initial.gapLeft} = ${m.afterTrack.gapRight})`,
      near(m.initial.gapLeft, m.afterTrack.gapRight),
    ],
    [
      `가로 여백 = 세로 여백 (${m.initial.gapLeft} = ${m.initial.gapTop})`,
      near(m.initial.gapLeft, m.initial.gapTop),
    ],
    [
      'disabled는 눌러도 그대로(aria-disabled · 꺼짐 유지)',
      m.disabled.ariaDisabled === 'true' && m.disabled.after === 'false',
    ],
  ].map(([label, pass]) => ({ label, pass }));

  await page.screenshot(join(outDir, 'switch.png'));
  return { name: 'Switch 토글·손잡이', checks };
}

/** 데모 스위치를 트랙·라벨 순으로 누르며 상태·횟수·손잡이 위치를 JSON 문자열로 돌려주는 페이지 코드. */
function measureExpression() {
  return `(async () => {
    const byLabel = (text) =>
      [...document.querySelectorAll('[role="switch"]')].find(
        (el) => el.closest('label')?.textContent === text,
      );
    const sw = byLabel(${JSON.stringify(LABEL)});
    const disabled = byLabel(${JSON.stringify(DISABLED_LABEL)});
    const counter = document.querySelector('[data-demo="switch-count"]');
    if (!sw || !disabled || !counter) return JSON.stringify({ error: 'Switch 데모를 찾지 못함' });
    sw.scrollIntoView({ block: 'center' });
    // 리렌더(프레임) + 손잡이 전환(0.12s)이 끝난 뒤에 읽는다.
    const settle = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 300)));
    const read = () => {
      const track = sw.getBoundingClientRect();
      const thumb = sw.firstElementChild.getBoundingClientRect();
      const round = (n) => Math.round(n * 100) / 100;
      return {
        checked: sw.getAttribute('aria-checked'),
        count: Number(counter.textContent.replace(/\\D/g, '')),
        track: { width: round(track.width), height: round(track.height) },
        gapLeft: round(thumb.left - track.left),
        gapRight: round(track.right - thumb.right),
        gapTop: round(thumb.top - track.top),
      };
    };
    await settle();
    const initial = read();
    sw.click();
    await settle();
    const afterTrack = read();
    [...sw.closest('label').querySelectorAll('span')].find((el) => el.textContent === ${JSON.stringify(LABEL)}).click();
    await settle();
    const afterLabel = read();
    disabled.click();
    await settle();
    const rootStyle = getComputedStyle(document.documentElement);
    return JSON.stringify({
      initial,
      afterTrack,
      afterLabel,
      disabled: {
        ariaDisabled: disabled.getAttribute('aria-disabled'),
        after: disabled.getAttribute('aria-checked'),
      },
      tokenWidth: rootStyle.getPropertyValue('--ui-switch-width').trim(),
      tokenHeight: rootStyle.getPropertyValue('--ui-switch-height').trim(),
    });
  })()`;
}
