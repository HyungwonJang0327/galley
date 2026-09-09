# apps/dashboard 단위 테스트 인프라

## 결정

`apps/dashboard`에 **vitest + happy-dom + @testing-library/react**를 도입한다. `packages/ui`와 같은 스택·같은 버전이다.

- `apps/dashboard/vitest.config.mts`(dashboard는 `"type": "module"`이 아니라 `.ts`면 CJS로 로드되어 vitest ESM 의존과 충돌 → `.mts`): `environment: 'happy-dom'`, `globals: true`(testing-library 자동 cleanup), `oxc.jsx.runtime = 'automatic'`(Next의 tsconfig는 `jsx: preserve`라 테스트에선 Vite 8의 변환기 oxc가 직접 변환해야 한다. `esbuild` 옵션은 Vite 8에서 무시됨). `.next/` 제외. tsconfig `include`에 `**/*.mts` 추가.
- `package.json` `test: vitest run --passWithNoTests` → 루트 `pnpm test`(`-r --if-present`)와 CI에 자동 포함. CI는 이미 `@galley/ui` build를 먼저 돌리므로 dist 소비도 문제없다.
- **테스트 범위**
  - `lib/` 순수 로직(상태→Badge 매핑, `?tab=` 파싱, 네비 활성 판정, 시각 계산 등) — 항상.
  - 클라이언트 컴포넌트(`'use client'`) — 동작이 있을 때. Next 훅(`usePathname` 등)은 `vi.mock('next/navigation', …)`로 대체.
  - **Server Component는 렌더 테스트하지 않는다.** 로직은 `lib/`로 빼서 테스트하고 `page.tsx`는 얇게 둔다(폴더 규칙 "lib = 도메인 어댑터"와 같은 방향).
  - CSS 레이아웃(폭·스크롤·뒤집힘)은 happy-dom이 레이아웃을 계산하지 않아 RED가 나오지 않는다 → 실측 스크립트(decisions/layout-measurement.md)가 담당.
- 파일 위치: 대상 옆 `X.test.ts(x)`(ui와 동일). `tsc --noEmit`이 테스트 파일도 검사한다.

## 이유

- A5b(상태→Badge 매핑)·AN4(탭·필터)부터 dashboard에 로직이 붙는데 test 스크립트가 없어 루트 `pnpm test`가 dashboard를 조용히 건너뛰고 있었다. CLAUDE.md §6 "테스트 없는 기능 금지"를 지키려면 지금 필요하다.
- ui가 이미 쓰는 happy-dom·testing-library 버전을 그대로 선언하므로 lockfile에 새 패키지가 들어오지 않는다. 두 패키지가 같은 테스트 작법을 공유해 옮겨 다니는 비용이 없다.
- `@vitejs/plugin-react` 없이 oxc jsx 옵션만으로 충분하다(ui도 플러그인 없이 TSX 테스트를 돌린다).

## 기각된 대안

- **vitest만(node 환경, `lib/` 전용)**: 설정은 더 작지만 SidebarProvider·탭 UI 같은 클라 컴포넌트 로직이 생기면 어차피 DOM 환경으로 승격해야 한다. 두 번 결정할 이유가 없다.
- **현상 유지(build + 프로덕션 스모크 + 실측만)**: 회귀를 잡을 수단이 없고 §6 위반.
- **Playwright e2e**: 새 라이브러리 + 브라우저 바이너리 + CI 시간. e2e가 필요해지는 시점(Phase 2, Storybook 실행 환경과 함께)에 재검토.
- **Next 공식 예시(`@vitejs/plugin-react` + jsdom)**: 플러그인은 라이브러리 추가, jsdom은 ui(happy-dom)와 이원화. 같은 결과를 더 적은 의존으로 얻는다.
- **dashboard `package.json`에 `"type": "module"` 추가(config를 `.ts`로 유지)**: Next 설정·앱 전체의 모듈 해석에 영향을 줄 수 있어 테스트 설정 하나 때문에 바꾸지 않는다.

## 결정일

2026-09-10

## 갱신 이력

- 2026-09-10 최초 결정(planning 미결 "dashboard 단위 테스트 인프라" 해소).
