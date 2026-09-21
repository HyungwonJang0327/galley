# galley-ui 경계 규칙

나중에 디자인 시스템으로 독립·npm 배포하므로 처음부터 아래를 강제한다.

## 결정

### 폴더 구조 (컴포넌트 하나 = 폴더 하나)

> 규칙(2026-09-21, RF-27): 폴더 이름 = 주 export 이름(`ToastProvider/ToastProvider.tsx`). CSS를 공유하는 보조 export(`ListRow/ListRows.tsx`·`ListToolbar/ListToolbarTab.tsx`·`TimelineItem/TimelineItems.tsx`)와 배럴 비공개 컨텍스트 파일(`FormField/FormFieldContext.ts`·`ToastProvider/ToastContext.ts`), 훅 폴더의 파생 훅(`useAwaitDialog/useConfirm.tsx`·`useAlert.tsx`)은 같은 폴더에 둘 수 있다. 5파일 규칙은 주 export 기준.

```
packages/ui/
  src/
    tokens/        # color·spacing·typography·radius·shadow → CSS 변수(--ui-*). 라이트/다크 둘 다
    primitives/    # Base UI 래퍼 (Tabs, Dialog, Menu, Select, Checkbox, Tooltip, Popover)
    components/    # 직접 작성 (Button, Badge, Card, PageHeader …) — X/{index.ts, X.tsx, X.module.css, X.test.tsx, X.stories.tsx}
    patterns/      # 앱 레이아웃 조합 (AppShell, SidebarGroup/Item, TopBarChip, ListToolbar, ListRow, SplitPane, TimelineItem, ActionBar)
    hooks/         # useAwaitDialog 등 헤드리스 훅
    index.ts       # 공개 API. 여기 export된 것만 앱이 쓴다
  package.json     # name galley-ui, exports 필드, sideEffects ["*.css"], peerDependencies react
  vite.config.ts   # 라이브러리 모드 ESM+CJS+스코프 CSS+d.ts. 앱은 빌드 산출물을 소비(src 직접 import 금지)
```

### 의존성 경계

- `galley-ui`는 `next`, `apps/*`, `packages/pipeline`을 import하지 않는다. **React + Base UI + lucide만.**
- 앱은 `galley-ui` 공개 배럴로만 접근. **`galley-ui/src/...` 딥 임포트 금지** (ESLint `no-restricted-imports`로 강제).
- **도메인 단어(주제·큐·실행·Zenn·벨로그) 금지.** ui는 `Badge` variant를 알지 "승인 대기"를 모른다. 도메인 매핑은 `apps/dashboard` 어댑터.
- 스타일은 tokens CSS 변수만 참조. 하드코딩 색·px 금지.

### `"use client"` (배포 시 소비자 호환)

- 현재 컴포넌트는 훅 0개·전부 표현 전용이라 Next App Router의 RSC에서 그대로 안전(디렉티브 불필요).
- **상태·이벤트 훅(useState/useEffect 등)을 쓰는 컴포넌트(예: Dialog·Popover·Tooltip 등 상태 있는 primitive)를 추가하면 그 파일 최상단에 `"use client"` 배너를 두고, 빌드 산출물에 보존되게 한다.** 안 그러면 npm 소비자가 RSC에서 import할 때 깨진다. (Vite 라이브러리 빌드가 배너를 제거하지 않는지 그때 확인 — 필요 시 `rollupOptions.output.banner`/플러그인으로 보존.)
- **규칙(2026-09-21, RF-28)**: 소스 파일의 `'use client'` 배너는 **Base UI를 import하거나 React 훅(useState·useEffect·useId·useRef…)을 쓰는 파일**에 둔다. 표현 전용 components·patterns는 두지 않는다. 번들 전체 배너라 런타임 영향은 없고 문서 역할이다.
- **확정(2026-09-09, UM1)**: Rollup은 모듈 지시어를 버리므로 Vite `rollupOptions.output.banner: '"use client";'`로 **번들 전체**(ESM·CJS)에 배너 1줄. 결과적으로 `galley-ui` 전부가 클라이언트 컴포넌트가 된다 — 표현 전용 컴포넌트도 클라이언트 번들에 실리지만 SSR HTML은 그대로이고 로컬 데스크톱 도구라 비용이 작다. 소스 파일의 `'use client'`는 문서 역할로 유지. **파일별 보존(`preserveModules` + 지시어 보존 플러그인)은 npm 배포 시점(Phase 2)에 재검토.**

### 검증

- `pnpm --filter galley-ui build && test`가 단독 통과.
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
- 2026-09-09 `"use client"` 보존 방식 확정(번들 전체 배너). Base UI 패키지명 `@base-ui/react`(base-ui-over-shadcn 갱신 이력).
- 2026-09-16 패키지명 치환: 구 스코프 이름 → `galley-ui`(P1b, decisions/package-name.md). 결정 변경 없음.
- 2026-09-17 P4-1 `Separator`는 `primitives/`가 아니라 `components/`(직접 작성). Base UI Separator는 `role="separator"` 고정이라 `decorative`(role none) 분기를 못 하고, div 하나라 래핑 이득이 없다. 결정 변경 없음(분류 기준 적용 사례).
- 2026-09-17 P4-4: Base UI Field 컨텍스트에 없는 값(`required`)은 **자체 컨텍스트**(`primitives/FormField/FormFieldContext.ts`, 배럴 비공개)로 같은 패키지의 컨트롤에 넘긴다 — `cloneElement`로 children에 주입하지 않는다(컨트롤마다 받는 방식이 다르고 래퍼·Fragment에서 조용히 실패). 컨트롤에 직접 준 값이 우선. `Form` 프리미티브 추가 결정(P4-4b) — FormField의 네이티브 검증 문구가 인라인으로 뜨려면 Base UI Form이 필요하다. 결정 변경 없음(경계 규칙 적용 사례).
- 2026-09-17 P4-4b `Form` 추가(사용자 결정). Base UI 래퍼의 prop 이름은 **Base UI 것을 그대로** 쓴다(`onFormSubmit`·`errors`) — 새 이름을 붙이지 않는다(얇은 래퍼). Base UI 동작 중 소비자가 밟기 쉬운 것(`errors` 참조 비교)은 래퍼에서 고치지 않고 JSDoc·README·동작 고정 테스트로 알린다 — 래퍼가 의미를 바꾸면 Base UI 문서와 어긋난다. 레이아웃 기본값을 주는 래퍼는 `:where()`로 명시도를 0으로 둔다. 결정 변경 없음.
- 2026-09-17 P4-5 `Popover` — "제어형만" 원칙의 **유일한 예외**(`open` 선택, 없으면 비제어). 예외를 두는 대신 그 예외가 만드는 함정(`open`만 주면 안 닫힘)은 **타입으로 막는다**(판별 유니온, 사용자 결정). 0.1.0 전에는 타입을 조이는 쪽이 싸다 — 배포 뒤에 조이면 breaking, 푸는 것은 아니다(Form 제네릭과 같은 논리). Base UI가 heading으로 그리는 부품(Popover.Title)은 비모달 컴포넌트에서는 `render`로 비-heading 요소로 바꾼다(모달인 Dialog는 그대로).
- 2026-09-21 P4-7 `Skeleton` — 장식 전용 컴포넌트(`aria-hidden` 기본)의 **로딩 안내는 API에 넣지 않는다**(소비자 규칙: 부모 `aria-busy` + 그 밖의 상시 `role="status"` 텍스트, 사용자 승인). 기본 속성은 스프레드 **뒤**에서 `?? 기본값`으로 보장한다(Separator의 role과 같은 관례 — 스프레드 앞에 두면 `undefined` 명시로 지워진다). 텍스트 자리에 놓이는 컴포넌트의 루트는 `span`(display:block). 숫자 치수 prop은 px로 받되 JSDoc으로 토큰 우선을 명시(RF1 어휘 판단 대상). 결정 변경 없음.
- 2026-09-21 P4-8 `Toast` — 명령형 훅(`useToast`)은 **Base UI의 목록 구독 훅을 그대로 노출하지 않는다**: Provider가 `createToastManager`를 한 번 만들어 자체 컨텍스트(배럴 비공개, FormFieldContext와 같은 자리)로 주고, 훅은 참조 안정·리렌더 없음을 보장한다. React 효과 순서(자식 먼저) 때문에 구독 전 명령이 유실되는 것은 래퍼가 버퍼로 막는다(Base UI 동작을 바꾸지 않고 앞에서 모아 둠). body로 포털되는 요소의 위치는 **토큰으로 연다**(`--ui-toast-inset`·`-top`) — 소비자가 감쌀 수 없기 때문. 결정 변경 없음.
- 2026-09-21 P4-9 `hooks/useAwaitDialog/`(useAwaitDialog·useConfirm) 추가. 사이드프로젝트의 `react-await-dialog` 단독 패키지는 이 훅으로 대체한다(별도 패키지 안 만듦 — Dialog 프리미티브와 같은 패키지에 있어야 `useConfirm`이 Dialog+Button을 조립할 수 있다). 훅은 열림 상태·Promise만 갖고 UI는 소비자 렌더 함수(`{ open, onOpenChange, resolve, cancel }`)가 그린다. `useConfirm`의 `tone: 'danger'`를 위해 Button `danger` variant(채움 토큰 `--ui-color-danger`·`-hover`) 추가, 초기 포커스를 위해 Dialog에 `initialFocus` prop(Base UI Popup 그대로 전달 — 얇은 래퍼 원칙). 새 `open()`마다 서브트리를 재마운트해 렌더 함수가 돌려준 컴포넌트 상태가 세션을 넘지 않게 한다(리뷰 M1, 훅에서 막는 쪽 채택). 결정 변경 없음.
- 2026-09-21 RF-05 `src/internal/` 추가 — 배럴에 노출하지 않는 공용 모듈 자리(첫 항목 `tone.ts`: Tone 어휘·아이콘 매핑·ConfirmTone→variant). 컴포넌트 둘 이상이 같은 상수·타입·헬퍼를 복제하면 여기로 올린다. 컨텍스트 파일(FormFieldContext·ToastContext)은 소유 컴포넌트 폴더에 그대로. 결정 변경 없음.
