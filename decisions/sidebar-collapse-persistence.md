# ⑦ 사이드바 접힘 저장: localStorage

## 결정

사이드바 접힘 상태는 localStorage에 저장한다. 서버 상태로 만들지 않는다. 활성 항목 판정은 URL(pathname) 기준(별개).

## 이유

- 세션 지속, 라우트 오염 없음.
- SSR 하이드레이션 플래시는 root `layout.tsx` `<body>` 첫 자식 인라인 스크립트가 페인트 전 localStorage를 읽어 `html[data-sidebar-collapsed]`를 선반영, `globals.css`가 그 속성으로 `--ui-sidebar-width`를 좁혀 방지. 서버·최초 클라 렌더는 `false`로 일치시켜 하이드레이션 경고를 피하고(라벨은 마운트 후 복원), 저장 키·속성은 `apps/dashboard/lib/sidebar-collapse.ts` 한 곳에서 서버 스크립트·클라 `SidebarProvider`가 공유한다.
- 접힘 UI는 `apps/dashboard`에서만 관리(`SidebarProvider`→`AppShell.sidebarCollapsed`). `@galley/ui`는 순수 표현 `collapsed` prop만 유지 — ui를 magic 전역 속성에 묶지 않아 독립 배포 소요를 늘리지 않는다.

## 기각된 대안

- **URL 쿼리(?nav=)**: 모든 라우트에 쿼리 오염.
- **서버 상태/쿠키+DB**: 접힘은 UI 선호값일 뿐, 서버가 알 필요 없음.

## 배포 시 변화

없음.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
- 2026-09-08 A3d 구현 반영 — 플래시 방지 메커니즘을 실제 구현에 맞게 정정(`<head>`/`data-nav` → `<body>` 첫 자식/`data-sidebar-collapsed`+`--ui-sidebar-width` 오버라이드). `@galley/ui` 무변경·저장 키 단일 출처 명시.
