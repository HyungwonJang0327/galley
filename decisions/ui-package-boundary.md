# @galley/ui 경계 규칙

나중에 디자인 시스템으로 독립·npm 배포하므로 처음부터 아래를 강제한다.

## 결정

### 폴더 구조 (컴포넌트 하나 = 폴더 하나)

```
packages/ui/
  src/
    tokens/        # color·spacing·typography·radius·shadow → CSS 변수(--ui-*). 라이트/다크 둘 다
    primitives/    # Base UI 래퍼 (Tabs, Dialog, Menu, Select, Checkbox, Tooltip, Popover)
    components/    # 직접 작성 (Button, Badge, Card, PageHeader …) — X/{index.ts, X.tsx, X.module.css, X.test.tsx, X.stories.tsx}
    patterns/      # 앱 레이아웃 조합 (AppShell, SidebarGroup/Item, TopBarChip, ListToolbar, ListRow, SplitPane, TimelineItem, ActionBar)
    hooks/         # useAwaitDialog 등 헤드리스 훅
    index.ts       # 공개 API. 여기 export된 것만 앱이 쓴다
  package.json     # name @galley/ui, exports 필드, sideEffects ["*.css"], peerDependencies react
  vite.config.ts   # 라이브러리 모드 ESM+CJS+스코프 CSS+d.ts. 앱은 빌드 산출물을 소비(src 직접 import 금지)
```

### 의존성 경계

- `@galley/ui`는 `next`, `apps/*`, `packages/pipeline`을 import하지 않는다. **React + Base UI + lucide만.**
- 앱은 `@galley/ui` 공개 배럴로만 접근. **`@galley/ui/src/...` 딥 임포트 금지** (ESLint `no-restricted-imports`로 강제).
- **도메인 단어(주제·큐·실행·Zenn·벨로그) 금지.** ui는 `Badge` variant를 알지 "승인 대기"를 모른다. 도메인 매핑은 `apps/dashboard` 어댑터.
- 스타일은 tokens CSS 변수만 참조. 하드코딩 색·px 금지.

### `"use client"` (배포 시 소비자 호환)

- 현재 컴포넌트는 훅 0개·전부 표현 전용이라 Next App Router의 RSC에서 그대로 안전(디렉티브 불필요).
- **상태·이벤트 훅(useState/useEffect 등)을 쓰는 컴포넌트(예: Dialog·Popover·Tooltip 등 상태 있는 primitive)를 추가하면 그 파일 최상단에 `"use client"` 배너를 두고, 빌드 산출물에 보존되게 한다.** 안 그러면 npm 소비자가 RSC에서 import할 때 깨진다. (Vite 라이브러리 빌드가 배너를 제거하지 않는지 그때 확인 — 필요 시 `rollupOptions.output.banner`/플러그인으로 보존.)

### 검증

- `pnpm --filter @galley/ui build && test`가 단독 통과.
- CI에서 별도 잡으로 ui build.
- 독립 시나리오: `packages/ui`를 새 리포로 옮겨도 build 통과하면 경계 유지. (`/ship` 체크리스트 항목)
- Storybook: Phase 1은 스토리 파일만, 실행 환경은 Phase 2.

## 기각된 대안

- **앱이 ui/src 직접 import**: 빌드 산출물 소비 원칙 무너짐, 독립 배포 불가.
- **ui에 도메인 로직 포함**: 재사용성·독립성 훼손.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
- 2026-09-08 빌드 도구 tsup→Vite 반영, `"use client"` 배포 호환 메모 추가.
