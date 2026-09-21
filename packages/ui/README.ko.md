# galley-ui

[English](https://github.com/HyungwonJang0327/galley/blob/main/packages/ui/README.md) · **한국어** · [日本語](https://github.com/HyungwonJang0327/galley/blob/main/packages/ui/README.ja.md)

데스크톱 관리 도구용 작은 React 디자인 시스템입니다. [Base UI](https://base-ui.com) 위에 디자인 토큰(라이트 + 다크), 헤드리스 래퍼 프리미티브, 레이아웃 패턴, Promise로 기다리는 다이얼로그 훅을 얹었습니다. 스타일은 CSS Modules와 CSS 커스텀 프로퍼티만 씁니다. 런타임 CSS-in-JS도, Tailwind도 없습니다.

도메인을 모릅니다. 컴포넌트는 `tone`, `variant`, `status`로만 말하고 여러분의 업무 용어는 쓰지 않습니다.

## 설치

```bash
pnpm add galley-ui
# peer dependencies
pnpm add react@^19 react-dom@^19
```

Node 20 이상, React 19가 필요합니다. ESM과 CJS, TypeScript 타입, 스타일시트 하나를 함께 배포합니다.

## 30초 예제

스타일시트(토큰 + 컴포넌트 스타일)를 한 번 import하고 조합합니다.

```tsx
import 'galley-ui/styles.css';
import { AppShell, SidebarGroup, SidebarItem, PageHeader, Card, Button, Badge } from 'galley-ui';

export function App() {
  return (
    <AppShell
      topBar={<strong>My tool</strong>}
      sidebar={
        <SidebarGroup label="Work">
          <SidebarItem label="Inbox" href="/inbox" isActive badge={<Badge tone="info">3</Badge>} />
          <SidebarItem label="Archive" href="/archive" />
        </SidebarGroup>
      }
    >
      <PageHeader title="Inbox" actions={<Button>New item</Button>} />
      <Card>
        <Badge tone="success">Done</Badge> Everything is ready.
      </Card>
    </AppShell>
  );
}
```

## 확인 다이얼로그를 한 줄로

galley-ui의 차별점입니다. 다이얼로그를 `await`합니다.

```tsx
import { Button, useConfirm } from 'galley-ui';

function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const { confirm, element } = useConfirm();
  return (
    <>
      <Button
        variant="danger"
        onClick={async () => {
          const ok = await confirm({
            title: '삭제할까요?',
            description: '되돌릴 수 없습니다.',
            confirmLabel: '삭제',
            cancelLabel: '취소',
            closeLabel: '닫기',
            tone: 'danger',
          });
          if (!ok) return;
          await onDelete();
        }}
      >
        삭제
      </Button>
      {element}
    </>
  );
}
```

- 어떻게 닫아도 resolve됩니다. 취소, Esc, 바깥 클릭, 닫기 버튼 전부 `false`로 끝납니다. reject가 없으니 `try/catch`도 없습니다.
- `tone: 'danger'`는 확인 버튼을 빨갛게 칠하고 초기 포커스를 **취소**에 둡니다. 기본 tone은 **확인**에 포커스합니다(APG).
- `{element}`는 한 번만 렌더합니다. 열린 채 다시 `confirm()`을 부르면 이전 Promise가 먼저 `false`로 끝납니다. 언마운트되면 대기 중인 Promise도 `false`로 끝납니다.
- `useAlert()`는 버튼 하나짜리 형제입니다(`await alert({ title })`, `void`로 resolve). 이름은 alert지만 `role="dialog"`이고 `alertdialog`가 아닙니다. 스크린리더에 끼어들지 않고, Esc와 바깥 클릭으로도 같은 방식으로 닫힙니다. 끼어들어야 하는 오류에는 `danger` 토스트나 `InlineAlert`를 쓰세요.
- 확인이 resolve된 뒤 이어지는 비동기 작업의 진행 표시는 호출한 쪽의 몫입니다(컨트롤 비활성, `role="status"` 문구). 다이얼로그는 이미 닫혔습니다.
- `useAwaitDialog<T>(cancelValue)`는 그 아래의 프리미티브입니다. 어떤 `Dialog`든 직접 렌더하고 `resolve(value)`를 부릅니다. Esc, 바깥 클릭, 닫기 버튼은 여기서도 `cancelValue`로 resolve됩니다. 렌더 함수는 렌더 중에 불리므로 상태가 필요하면 컴포넌트를 반환하세요. 열 때마다 다시 마운트되어 이전 입력이 남지 않습니다. 클로저는 `open()` 시점에 고정됩니다. 열려 있는 동안 바뀐 상태는 안에 반영되지 않습니다.

## 다크 모드

색은 전부 토큰입니다. `<html>`에 속성 하나로 전환합니다.

```html
<html data-theme="dark"></html>
```

그 외에는 아무것도 바뀌지 않습니다. 간격, 타이포, 라운드, 모션은 공유합니다. 선택을 저장하는 것은 앱의 일입니다.

## 컴포넌트

| 그룹                          | export                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **components** (직접 작성)    | `Badge` · `Button` · `Card` · `EmptyState` · `InlineAlert` · `PageHeader` · `Separator` · `Skeleton` · `StatTile`                                                                     |
| **primitives** (Base UI 래퍼) | `Checkbox` · `Dialog` · `Form` · `FormField` · `Input` · `Menu` · `Popover` · `RadioGroup` · `Select` · `Switch` · `Tabs` · `Textarea` · `ToastProvider` · `Tooltip`                  |
| **patterns** (레이아웃)       | `AppShell` · `SidebarGroup` · `SidebarItem` · `TopBarChip` · `ListToolbar` / `ListToolbarTab` · `ListRow` / `ListRows` · `SplitPane` · `TimelineItem` / `TimelineItems` · `ActionBar` |
| **hooks**                     | `useConfirm` · `useAlert` · `useAwaitDialog` · `useToast`                                                                                                                             |

props 타입도 전부 export됩니다(`ButtonProps`, `BadgeTone`, `SelectItem`, `MenuEntry`, `TimelineStatus`, …).

### 어휘

- `tone`은 **색으로 표현한 의미**입니다. `InlineAlert`와 토스트는 `info | success | warning | danger`, `Badge`는 여기에 `neutral`을 더하고, `StatTile`은 `default | muted | warning`, `useConfirm` / `useAlert`는 `default | danger`입니다. 도메인 상태를 tone에 매핑하는 것은 앱입니다.
- `variant`는 **모양 또는 역할**입니다. `Button`은 `primary | secondary | ghost | danger`, `InlineAlert`는 `filled | plain`.
- `TimelineItem`의 `status`는 `pending | active | done | failed`.
- 접근성 이름은 항상 `aria-label`로 넘깁니다(`Select`, `Tabs`, `RadioGroup`, `ActionBar`, `ToastProvider`, …). `Checkbox`와 `Switch`는 보이는 라벨을 `children`으로 받습니다(없으면 `aria-label`).

### 기본 라벨은 영어

내장 문구의 기본값은 영어입니다. Dialog 닫기 버튼 `Close`, 토스트 영역 `Notifications`, `useConfirm`의 `Confirm` / `Cancel`, `useAlert`의 `OK`. 호출하는 자리에서 지역화하세요.

```tsx
<Dialog closeLabel="닫기" … />
<ToastProvider aria-label="알림" closeLabel="닫기">…</ToastProvider>
confirm({ title, confirmLabel: '확인', cancelLabel: '취소', closeLabel: '닫기' })
```

## 설계 원칙

- **제어형만.** 입력은 `value` / `checked`와 `onValueChange` / `onCheckedChange`를 받습니다(`Input`과 `Textarea`는 네이티브 `onChange` 유지). 컴포넌트가 폼 상태를 갖지 않습니다. 앱이 상태를 가질 이유가 없는 두 곳만 예외입니다. `Popover`(`open` 선택, `open`을 주면 `onOpenChange` 필수)와 `TimelineItem`의 펼침(`defaultOpen`).
- **얇은 래퍼.** 프리미티브는 Base UI의 prop 이름을 그대로 씁니다(`onFormSubmit`, `errors`, `onOpenChange`). 밟기 쉬운 동작은 감추지 않고 문서로 알립니다.
- **리터럴 대신 토큰.** 색, 간격, 타이포, 라운드, 그림자, 모션(`--ui-duration-*`, `--ui-ease`), 포커스 링(`--ui-focus-ring`), 층(`--ui-z-popup`, `--ui-z-toast`), 치수가 `--ui-*` 커스텀 프로퍼티입니다. `:root`에서 덮어써 테마를 바꿉니다.
- **CSS Modules.** 클래스 이름은 스코프됩니다(`ui_<local>_<hash>`). 모든 컴포넌트가 넘긴 `className`을 병합합니다. 루트에, 또는 플로팅 프리미티브(`Dialog`, `Menu`, `Popover`, `Tooltip`, `Select`)는 popup이나 trigger에.
- **도메인 무지.** props, 기본값, 문서에 업무 용어가 없습니다.
- **클라이언트 번들.** 번들 전체에 `"use client"` 배너가 있어 React Server Components에서 import할 수 있습니다. 따라서 모든 export는 클라이언트 컴포넌트입니다. 서버 렌더(SSR)는 그대로 되고, 클라이언트로도 함께 전송될 뿐입니다.
- **개발 경고.** `FormField` 밖에서 접근성 이름이 없는 `Checkbox`, `Switch`, `RadioGroup`은 번들러가 `process.env.NODE_ENV`를 정의하고 그 값이 `'production'`이 아닐 때 `console.warn`을 냅니다(`process`가 없으면 침묵).

## 컴포넌트별 주의

**Form · FormField** — `required`는 `FormField`에만 적습니다. 안쪽 컨트롤이 네이티브 `required`를 물려받습니다. 일반 `<form>` 안에서는 브라우저 말풍선이 뜨고, `Form` 안에서만 오류가 필드 아래에 인라인으로 뜹니다. `errors`의 키는 컨트롤 `name`입니다. 객체 참조를 안정적으로 유지하세요(state나 상수). 인라인 리터럴이면 렌더마다 오류가 다시 적용되어 제출이 막힙니다. 오류가 남은 필드는 제출을 막습니다. 앱 수준 `error`는 앱이 지우고, 제출 뒤 정해지는 오류는 `errors`로 넘깁니다. `onFormSubmit`이 없으면 `action`이 평소처럼 제출합니다(이벤트 정보는 네이티브 `onSubmit`). 첫 제출 뒤에는 change마다 다시 검증합니다. `FormField` 안의 `Switch` / `Checkbox`는 `children`을 받지 않습니다. 필드 라벨이 이름이 됩니다. `Form<Values>` 제네릭은 제출 값의 타입만 좁힙니다. 값이 `Values`와 맞는지 런타임에 검사하지 않습니다. 기본 세로 배치는 `:where()`(명시도 0)로 작성되어 넘긴 `className`(예: grid)이 CSS 로드 순서와 무관하게 이깁니다.

**Popover** — 비모달입니다. `onOpenChange(false)`는 포커스가 떠날 때도 옵니다. `title`은 heading이 아닙니다.

**InlineAlert** — live 영역은 제목 + 본문입니다. `action`은 그 밖에 있습니다. `danger` / `warning`은 `role="alert"`라 조건부로 렌더되면 읽힙니다. `info` / `success`는 `role="status"`라 영역과 문구가 동시에 생기면 읽힌다는 보장이 없습니다. 중요하면 앱에 상시 영역을 마운트하세요. 정적 안내에는 `info`를, 행 안이나 이미 상자인 곳에는 `variant="plain"`을 씁니다.

**Toast** — `ToastProvider`는 앱 루트에 하나입니다. 고정 상단 바가 있으면 `:root`에 `--ui-toast-inset-top: calc(<바 높이> + var(--ui-toast-inset))`를 둡니다. 닫기 버튼은 뷰포트가 펼쳐지기(hover / focus) 전까지 보조 기술에 숨겨집니다. 키보드 경로는 Esc와 F6입니다. `danger` / `warning` 토스트는 `alertdialog`로 끼어들어 읽히고, 포커스 전까지 `aria-hidden`이라 테스트에서 role로 찾을 때 `hidden: true`가 필요합니다. `useToast()`는 목록을 구독하지 않아 호출한 쪽이 리렌더되지 않습니다. 마운트 effect에서 써도 안전합니다. 모달 `Dialog`가 열린 동안 띄운 토스트가 읽히는지는 검증하지 않았습니다.

**Dialog** — `description`은 `<p>` 안에 그려집니다. 표나 목록 같은 블록은 `children`에 넣으세요. `initialFocus`는 ref 또는 `false`를 받습니다. 같은 이유로 `useConfirm` / `useAlert`도 `children`과 `closeLabel`을 노출합니다.

**Skeleton** — `radius`는 `sm | md | lg | pill`. `width` / `height`는 숫자(px) 또는 CSS 길이.

**useAwaitDialog** — React StrictMode(개발)에서 *자식*의 마운트 effect에서 열면 첫 Promise가 cancel 값으로 끝납니다. StrictMode가 부모 effect 전에 언마운트를 시뮬레이션하기 때문입니다. 소유 컴포넌트의 effect나 이벤트 핸들러에서 열어 주세요.

## 접근성

모든 컴포넌트의 기준선: 키보드로 조작 가능, 보이는 `:focus-visible` 링(토큰), 라벨 또는 `aria-label`로 접근성 이름, 두 테마 모두 글자 대비 4.5:1 이상(다크 값은 대비표로 골랐습니다). 포커스 트랩, roving tabindex, dismiss 동작은 Base UI가 제공하고, Base UI 1.8이 빼놓은 role과 이름은 래퍼가 채웁니다(`Tooltip` popup의 `role="tooltip"`).

아직 검증하지 않은 것: Windows forced-colors(고대비) 모드는 `Separator`만 대응합니다. 토글 상태와 선택 표시가 색에 의존해 손볼 곳이 있을 수 있습니다. `Form` 제출 실패와 모달 위 토스트의 스크린리더 낭독은 후속 과제입니다.

## 모션

전환과 펄스는 `--ui-duration-*` 토큰을 씁니다. `prefers-reduced-motion: reduce`에서는 토큰이 `0s`로 바뀌고 펄스가 멈춥니다. 컴포넌트별 미디어 쿼리를 관리할 필요가 없습니다.

## 문서 사이트

컴포넌트 카탈로그(Storybook 또는 정적 사이트)는 예정입니다. 그때까지는 이 README, export된 TypeScript 타입(모든 prop에 JSDoc), 그리고 [Galley](https://github.com/HyungwonJang0327/galley) 리포의 컴포넌트 갤러리가 기준입니다. 대시보드를 로컬에서 띄우고 `/design`을 열어 보세요.

## 라이선스

[MIT](https://github.com/HyungwonJang0327/galley/blob/main/packages/ui/LICENSE)
