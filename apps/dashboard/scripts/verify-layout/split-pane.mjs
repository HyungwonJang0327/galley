// 2분할 상세형(B) 실측: 좌 고정폭·좌우 독립 스크롤·하단 바 고정·펼침이 하단 바를 밀지 않음.
// jsdom은 레이아웃을 계산하지 않으므로 이 성질들은 실제 브라우저에서만 잴 수 있다.
// 갤러리의 aria-label에 결합되어 있다 — 갤러리를 바꾸면 여기도 맞춘다(decisions/layout-measurement.md).
//
// click 뒤 측정은 async로 기다린다 — React 리렌더는 클릭과 같은 동기 블록이 아니라 그 뒤에 일어나서,
// 바로 읽으면 펼치기 전 값이 잡힌다(Select 팝업 스크롤 정착과 같은 계열의 측정 타이밍 함정).
import { join } from 'node:path';

export async function verifySplitPane(page, { outDir }) {
  const m = JSON.parse(
    await page.evaluate(`(async () => {
      const rect = (el) => el.getBoundingClientRect();
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const list = document.querySelector('[aria-label="목록 영역"]');
      const detail = document.querySelector('[aria-label="상세 영역"]');
      const bar = document.querySelector('[aria-label="하단 액션 바"]');
      const pane = list.parentElement;
      // 상세의 자식 행: 헤더 / 본문(스크롤) / 하단 바 래퍼.
      const body = detail.querySelector('[data-demo="상세 본문"]').parentElement;
      const header = detail.firstElementChild;
      const expected = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--ui-splitpane-list-width'),
      );

      const listWidth = rect(list).width;
      const sameTop = Math.abs(rect(list).top - rect(detail).top) < 1;
      const barBottomGap = Math.round(rect(detail).bottom - rect(bar).bottom);

      // 좌만 스크롤 → 우 본문은 그대로.
      const bodyTopBefore = rect(body.firstElementChild).top;
      list.scrollTop = 100000;
      const listScrollTop = list.scrollTop;
      const bodyTopAfterListScroll = rect(body.firstElementChild).top;

      // 우 본문만 스크롤 → 헤더·하단 바는 제자리.
      const headerTopBefore = rect(header).top;
      const barTopBefore = rect(bar).top;
      body.scrollTop = 100000;
      const bodyScrollTop = body.scrollTop;
      const headerTopAfter = rect(header).top;
      const barTopAfter = rect(bar).top;
      const listScrollAfterBody = list.scrollTop;

      // 타임라인 줄을 펼쳐도 하단 바는 밀리지 않는다(본문만 길어진다).
      const toggle = detail.querySelector('button[aria-controls]');
      const toggleFound = toggle !== null;
      const paneHeightBefore = rect(pane).height;
      let expanded = null;
      let panelHeight = null;
      let barTopAfterExpand = barTopAfter;
      let paneHeightAfter = paneHeightBefore;
      if (toggleFound) {
        toggle.click();
        // 하이드레이션·리렌더가 끝날 때까지 최대 2초 기다린다.
        for (let i = 0; i < 40 && toggle.getAttribute('aria-expanded') !== 'true'; i++) {
          await frame();
        }
        expanded = toggle.getAttribute('aria-expanded');
        const panel = document.getElementById(toggle.getAttribute('aria-controls'));
        panelHeight = panel === null ? null : rect(panel).height;
        barTopAfterExpand = rect(bar).top;
        paneHeightAfter = rect(pane).height;
      }

      return JSON.stringify({
        expected, listWidth, sameTop, barBottomGap,
        listClientHeight: list.clientHeight, listScrollHeight: list.scrollHeight, listScrollTop,
        bodyClientHeight: body.clientHeight, bodyScrollHeight: body.scrollHeight, bodyScrollTop,
        bodyTopBefore, bodyTopAfterListScroll, listScrollAfterBody,
        headerTop: [headerTopBefore, headerTopAfter], barTop: [barTopBefore, barTopAfter],
        toggleFound, expanded, panelHeight, barTopAfterExpand,
        paneHeight: [paneHeightBefore, paneHeightAfter],
      });
    })()`),
  );

  const checks = [
    [`좌 목록 폭 = --ui-splitpane-list-width(${m.expected})`, m.listWidth === m.expected],
    ['좌·우가 같은 행(top 동일)', m.sameTop],
    [
      '좌 목록만 자체 스크롤(scrollHeight > clientHeight, 이동함)',
      m.listScrollHeight > m.listClientHeight && m.listScrollTop > 0,
    ],
    ['좌를 스크롤해도 우 본문은 그대로', m.bodyTopBefore === m.bodyTopAfterListScroll],
    [
      '우 본문만 스크롤(scrollHeight > clientHeight, 이동함)',
      m.bodyScrollHeight > m.bodyClientHeight && m.bodyScrollTop > 0,
    ],
    ['우를 스크롤해도 좌 스크롤 위치 불변', m.listScrollAfterBody === m.listScrollTop],
    ['우 헤더 위치 불변', m.headerTop[0] === m.headerTop[1]],
    ['하단 바 위치 불변', m.barTop[0] === m.barTop[1]],
    ['하단 바가 상세 영역 바닥에 붙음', Math.abs(m.barBottomGap) <= 1],
    // 실패해도 원인이 바로 보이게 실측값을 라벨에 남긴다.
    [
      `타임라인 줄이 펼쳐짐(토글 ${m.toggleFound}, aria-expanded ${m.expanded}, 펼침 높이 ${m.panelHeight})`,
      m.expanded === 'true' && m.panelHeight > 0,
    ],
    ['펼쳐도 하단 바가 밀리지 않음', m.barTopAfterExpand === m.barTop[1]],
    ['펼쳐도 분할 영역 높이 불변(본문만 길어짐)', m.paneHeight[0] === m.paneHeight[1]],
  ].map(([label, pass]) => ({ label, pass }));

  await page.screenshot(join(outDir, 'split-pane.png'));
  return { name: '2분할 상세형(SplitPane·Timeline·ActionBar)', metrics: m, checks };
}
