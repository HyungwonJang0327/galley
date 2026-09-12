// 404 실측: 없는 경로에서도 셸(TopBar·Sidebar)이 살아 있고 안내는 Content 안에만 있는지.
// Next 기본 404는 라우트 그룹 레이아웃을 타지 않아 셸 없이 뜬다 — app/not-found.tsx가 셸을
// 직접 두르는 이유이고, 그 조립이 깨지면 여기서 잡힌다.
import { join } from 'node:path';

export async function verifyNotFound(page, { outDir }) {
  const m = JSON.parse(
    await page.evaluate(`(() => {
      const header = document.querySelector('header');
      const aside = document.querySelector('aside');
      const main = document.querySelector('main');
      const rect = (el) => el.getBoundingClientRect();
      const root = getComputedStyle(document.documentElement);
      const token = (name) => parseFloat(root.getPropertyValue(name));
      const heading = [...document.querySelectorAll('h1')].find((h) =>
        h.textContent.includes('찾을 수 없'),
      );
      const back = [...document.querySelectorAll('a')].find((a) =>
        a.textContent.includes('큐로 가기'),
      );
      const se = document.scrollingElement;
      return JSON.stringify({
        hasHeader: header !== null,
        hasNav: aside !== null && aside.querySelector('nav') !== null,
        navGroups: aside === null ? 0 : aside.querySelectorAll('nav').length,
        topbarHeight: header === null ? 0 : Math.round(rect(header).height),
        expectedTopbar: token('--ui-topbar-height'),
        asideWidth: aside === null ? 0 : Math.round(rect(aside).width),
        expectedAside: token('--ui-sidebar-width'),
        hasHeading: heading !== undefined,
        headingLeft: heading === undefined ? 0 : Math.round(rect(heading).left),
        mainLeft: main === null ? 0 : Math.round(rect(main).left),
        backHref: back === undefined ? null : new URL(back.href).pathname,
        docScrollWidth: se.scrollWidth,
        innerWidth,
      });
    })()`),
  );

  await page.screenshot(join(outDir, 'not-found.png'));

  return {
    name: 'verifyNotFound',
    checks: [
      { label: `TopBar가 있다 (height ${m.topbarHeight})`, pass: m.hasHeader },
      {
        label: `TopBar 높이가 토큰과 같다 (${m.topbarHeight} = ${m.expectedTopbar})`,
        pass: m.topbarHeight === Math.round(m.expectedTopbar),
      },
      { label: `사이드바 메뉴가 살아 있다 (nav ${m.navGroups}개)`, pass: m.hasNav },
      {
        label: `사이드바 폭이 토큰과 같다 (${m.asideWidth} = ${m.expectedAside})`,
        pass: m.asideWidth === Math.round(m.expectedAside),
      },
      { label: '안내 제목이 보인다', pass: m.hasHeading },
      {
        label: `안내가 Content 안에 있다 (h1 left ${m.headingLeft} ≥ main left ${m.mainLeft})`,
        pass: m.hasHeading && m.headingLeft >= m.mainLeft,
      },
      { label: `"큐로 가기"가 /queue로 간다 (${m.backHref})`, pass: m.backHref === '/queue' },
      {
        label: `가로 스크롤이 없다 (${m.docScrollWidth} ≤ ${m.innerWidth})`,
        pass: m.docScrollWidth <= m.innerWidth,
      },
    ],
  };
}

/** 이 검사만 다른 경로를 연다(없는 경로여야 404가 난다). */
verifyNotFound.path = '/no-such-page';
