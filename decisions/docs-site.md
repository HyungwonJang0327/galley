# galley-ui 문서 사이트: Storybook 정적 빌드 → GitHub Pages

## 결정

**galley-ui의 정식 쇼케이스는 Storybook(react-vite)이고, `storybook build` 산출물을 GitHub Pages에 올린다.** 소개(랜딩)는 Storybook 안의 MDX 한 장(`Introduction`)으로 대신한다. 별도 `apps/docs` 사이트는 만들지 않는다.

- 위치: `packages/ui/.storybook/`(main·preview·전용 vite 설정·Introduction.mdx). 스크립트 `storybook`(dev 6006)·`storybook:build`(→ `storybook-static/`, gitignore).
- 애드온: `@storybook/addon-docs`(autodocs — props 표 + 전 스토리) · `@storybook/addon-a11y`(axe 패널). 테마 토글은 preview 글로벌(`<html data-theme>`, 앱과 같은 방식) + body 배경·글자색을 토큰으로.
- **Vite 설정 분리**: 라이브러리 빌드용 `vite.config.ts`(lib·dts·external)를 Storybook이 끌어오지 않게 `.storybook/vite.config.ts`(react 플러그인 + 같은 CSS Modules 클래스명 규칙)를 따로 둔다.
- 배포: `.github/workflows/pages.yml` — main push에 `packages/ui/**` 변경이 있으면 build → `actions/deploy-pages`. 주소 `https://hyungwonjang0327.github.io/galley/`. Pages는 Actions 빌드(`build_type: workflow`).
- 스토리 샘플 문구에서 **도메인 단어를 뺀다**(RF-31의 스토리 부분) — 공개 쇼케이스는 "도메인 무지" 원칙(ui-package-boundary)을 눈으로 보여야 한다. 테스트 파일의 샘플은 공개되지 않으므로 그대로(P7k).
- README(en·ko·ja)에 사이트 링크 → galley-ui **patch** 릴리즈(npm 페이지 README 갱신). 이 릴리즈가 태그 트리거 CI publish(decisions/ci-publish.md)의 첫 실전.

## 이유

- 스토리 37개가 이미 있고, 결정 문서 둘(component-gallery·ui-package-boundary)이 "Storybook = Phase 2 정식 쇼케이스"를 가리키고 있었다. 가장 짧은 길이다.
- autodocs가 props 표·상태별 화면을 공짜로 만든다 — 별도 카탈로그를 쓸 이유가 없다.
- Storybook 10.6은 Vite 8·React 19를 지원해 툴체인 핀과 충돌이 없다.

## 기각된 대안

- **`apps/docs` Next `output: 'export'` 랜딩**: 소개 글의 자유도는 있지만 하루 이상이고 컴포넌트 카탈로그는 따로 필요해 결국 Storybook이 다시 든다. 모노레포에 앱이 하나 늘어난다.
- **둘 다**: 지금 가치 대비 가장 비싸다. 소개가 더 필요해지면 Storybook 위에 MDX 페이지를 더 쓴다.
- **보류(README만)**: Phase 2 약속이 열린 채로 남고 CI publish 첫 실전도 미뤄진다.

## 영향

- 의존성 추가(galley-ui devDependencies): `storybook`·`@storybook/react-vite`·`@storybook/addon-docs`·`@storybook/addon-a11y` 10.6.7, `@vitejs/plugin-react` 6.3.0. 배포 번들에는 들어가지 않는다.
- `.storybook`을 ui tsconfig `include`에 넣어 typecheck·lint가 본다. `storybook-static/`은 eslint·prettier ignore.
- `/design` 갤러리(앱 안 개발 보조)와 Storybook(패키지 쇼케이스)은 역할이 다르니 둘 다 유지 — 갤러리는 실측(`verify:layout`)의 대상이고 Storybook은 문서다.

## 결정일

2026-11-12

## 갱신 이력

- 2026-11-12 최초 결정(P7c, 사용자 "응 시작해" — 선택지 4개 중 "Storybook 정적 빌드 → Pages + RF-31 스토리 정리 포함").
