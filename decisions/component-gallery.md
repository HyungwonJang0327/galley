# 컴포넌트 갤러리 (in-app /design)

## 결정

개발 중 컴포넌트를 눈으로 확인할 갤러리를 `apps/dashboard`의 `/design` 라우트로 둔다.

- 위치: `app/(dashboard)/design/page.tsx` → URL `/design`, **대시보드 셸(TopBar/Sidebar) 안**에서 렌더.
- **A3(셸) 완료 후** 세팅. A2b보다 앞당기지 않는다(먼저 컴포넌트를 쌓는다).
- 컴포넌트가 추가될 때마다 갤러리에 얹는다.
- Storybook은 **Phase 2의 정식 독립 쇼케이스**로 유지(패키지와 함께 이동). 즉 `/design`=개발 보조(앱 종속), Storybook=배포용 정식(패키지 종속).

## 이유

- 앱 안에서 실제 셸 맥락으로 컴포넌트를 보고 싶음 + 포트폴리오로 대시보드에 디자인 섹션을 노출.
- "셸 안"은 A3 셸이 있어야 성립 → A3 이후.

## 패키지 분리에 영향 없음

- `/design`은 `packages/ui`가 아니라 `apps/dashboard`에 산다. 다른 앱 화면처럼 `galley-ui` **공개 배럴만** 소비한다.
- 의존 방향은 앱 → ui 한쪽뿐. ui 독립성 조건(단독 build/test, next·앱 미의존)과 무관.
- ui 추출 시 `/design`은 앱에 남고, 앱은 `galley-ui`를 npm에서 가져오도록만 바뀐다.

## 기각된 대안

- **독립 in-app 라우트(셸 밖 자체 레이아웃)**: "셸 맥락에서 보고 싶다"는 목적과 안 맞음.
- **Storybook을 Phase 1로 앞당김**: 설정 비용. 지금 목적은 앱 내 확인. Storybook은 Phase 2 유지(→ ui-package-boundary).

## 경계

- `/design`은 도메인 무지 갤러리 — `galley-ui` 공개 배럴로만 컴포넌트 소비. 담당 frontend.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
- 2026-09-10 갤러리를 바꾸는 항목의 완료 조건에 `pnpm --filter dashboard verify:layout` 통과 추가 — 실측 스크립트가 갤러리의 aria-label·구조에 결합되어 있어 갤러리를 바꾸면 스크립트도 같이 맞춘다(decisions/layout-measurement.md).
- 2026-09-16 패키지명 치환: 구 스코프 이름 → `galley-ui`(P1b, decisions/package-name.md). 결정 변경 없음.
- 2026-11-12 P7c: Storybook 실행 환경 구현(react-vite + addon-docs·a11y, GitHub Pages — decisions/docs-site.md). "Storybook = Phase 2 정식 쇼케이스" 약속 이행, `/design`은 개발 보조·실측 대상으로 그대로. 결정 변경 없음.
- 2026-11-14 P7d Pagination: 갤러리 섹션 4데모 + pagination.mjs. 규칙 확인 — 상태·함수 prop이 필요한 데모는 PrimitiveDemos(클라)에(서버 page.tsx가 클라이언트 컴포넌트에 함수를 넘기면 /design 전체가 깨진다). `'use client'`는 번들 배너로 충분(RF-28·UM1), 소스 배너는 훅·Base UI 파일에만. 색 전환이 있는 요소를 재는 모듈은 `getAnimations` 완료를 기다린 뒤 읽는다. 결정 변경 없음.
- 2026-11-14 P7d Table: 갤러리 섹션 5데모 + table.mjs(정렬 데모는 PrimitiveDemos — 정렬 상태는 앱). 결정 변경 없음.
- 2026-11-14 P7k: Tabs 섹션 `data-demo="tabs"` + tabs.mjs(실제 키 입력). happy-dom이 못 잡는 키보드 동작은 실측 모듈로 — 이번에 Base UI 수동 활성화 기본값을 잡아냈다. 결정 변경 없음.
