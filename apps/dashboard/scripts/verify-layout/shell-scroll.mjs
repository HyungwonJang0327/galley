// AppShell 스크롤 구조 실측: TopBar·Sidebar 고정, Content(·Sidebar)만 스크롤, 접힘은 열 폭만 변경.
// 기대값은 페이지의 --ui-* 토큰에서 읽는다(decisions/layout.md 2026-09-10 셸 스크롤 구조).
import { join } from 'node:path';

export async function verifyShellScroll(page, { outDir }) {
  const m = JSON.parse(
    await page.evaluate(`(() => {
      const se = document.scrollingElement;
      const header = document.querySelector('header');
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const rect = (el) => el.getBoundingClientRect();
      // 접힘 속성이 --ui-sidebar-width를 덮어쓰므로 토글 전에 읽는다.
      const root = getComputedStyle(document.documentElement);
      const token = (name) => parseFloat(root.getPropertyValue(name));
      const expected = {
        topbar: token('--ui-topbar-height'),
        sidebar: token('--ui-sidebar-width'),
        collapsed: token('--ui-sidebar-collapsed-width'),
      };
      const before = { header: rect(header).top, aside: rect(aside).top, asideWidth: rect(aside).width };
      window.scrollTo(0, 100000);
      const docScrollTop = se.scrollTop;
      main.scrollTop = 100000;
      const mainScrollTop = main.scrollTop;
      // 사이드바 메뉴를 20개 늘려 사이드바만 스크롤되는지 본다.
      const nav = aside.querySelector('nav');
      const item = nav.querySelector('a');
      for (let i = 0; i < 20; i++) {
        const clone = item.cloneNode(true);
        clone.removeAttribute('aria-current');
        nav.appendChild(clone);
      }
      aside.scrollTop = 100000;
      const after = { header: rect(header).top, aside: rect(aside).top };
      document.documentElement.setAttribute('data-sidebar-collapsed', 'true');
      const asideCollapsedWidth = rect(aside).width;
      document.documentElement.removeAttribute('data-sidebar-collapsed');
      return JSON.stringify({
        expected,
        innerHeight, innerWidth,
        docScrollHeight: se.scrollHeight, docScrollTop,
        bodyOverflow: getComputedStyle(document.body).overflow,
        mainClientHeight: main.clientHeight, mainScrollHeight: main.scrollHeight, mainScrollTop,
        mainRight: Math.round(rect(main).right),
        headerTop: [before.header, after.header], asideTop: [before.aside, after.aside],
        asideClientHeight: aside.clientHeight, asideScrollHeight: aside.scrollHeight, asideScrollTop: aside.scrollTop,
        asideWidth: before.asideWidth, asideCollapsedWidth,
      });
    })()`),
  );
  const { expected: e } = m;

  const checks = [
    ['문서(body) 스크롤 없음: docScrollTop === 0', m.docScrollTop === 0],
    ['문서 높이 = 뷰포트(문서가 안 늘어남)', m.docScrollHeight <= m.innerHeight + 1],
    ['body overflow hidden', m.bodyOverflow === 'hidden'],
    ['Content만 스크롤: main.scrollHeight > clientHeight', m.mainScrollHeight > m.mainClientHeight],
    ['Content 스크롤 실제 이동: main.scrollTop > 0', m.mainScrollTop > 0],
    ['Content 스크롤바가 영역 우측 끝(main.right === innerWidth)', m.mainRight === m.innerWidth],
    ['TopBar 위치 불변(top 0)', m.headerTop[0] === 0 && m.headerTop[1] === 0],
    [
      `Sidebar 위치 불변(top = --ui-topbar-height ${e.topbar})`,
      m.asideTop[0] === e.topbar && m.asideTop[1] === e.topbar,
    ],
    [
      '메뉴 20개+ 시 사이드바만 스크롤',
      m.asideScrollHeight > m.asideClientHeight && m.asideScrollTop > 0,
    ],
    [
      `접힘 토글 시 열 폭만 변경(${e.sidebar}→${e.collapsed}, 토큰)`,
      m.asideWidth === e.sidebar && m.asideCollapsedWidth === e.collapsed,
    ],
  ].map(([label, pass]) => ({ label, pass }));

  await page.screenshot(join(outDir, 'shell-scroll.png'));
  return { name: 'AppShell 스크롤 구조', metrics: m, checks };
}
