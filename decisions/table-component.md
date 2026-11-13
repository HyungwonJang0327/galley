# Table: 표현 전용 직접 구현, 정렬·필터 로직은 앱

## 결정

`galley-ui`의 Table은 **표현 전용 조합 컴포넌트**로 직접 만든다 — `Table` · `TableHead` · `TableBody` · `TableRow` · `TableHeaderCell` · `TableCell` · `TableEmptyRow`. 네이티브 `<table>` 위에 토큰 스타일·밀도(`density`)·고정 머리글(`stickyHeader`)·정렬 표시(`sortDirection` → `aria-sort`, `onSort` → 머리글 버튼)·숫자 열(`numeric`)·선택/상호작용 행 표시만 얹는다. **어떤 열을 어떻게 정렬·필터할지는 앱이 정하고 정렬된 행을 넘긴다.** 가상화·그룹화·열 숨김은 범위 밖이다. 나중에 그것이 필요하면 TanStack Table을 **`apps/dashboard`에** 두고 ui Table로 그린다(dnd와 같은 배치 — decisions/dnd-library.md).

## 이유

- 의존성 경계 유지: ui는 React + Base UI + lucide만(decisions/ui-package-boundary.md). 번들 0 증가, 소비자 peer 의존성 추가 없음.
- Galley 규모(행 수십, 로컬 단일 사용자)에는 네이티브 표 + 앱 정렬로 충분하다. 접근성은 `<table>`·`<th scope>`·`aria-sort`로 공짜.
- "로직은 앱, ui는 표현"이 이미 큐 DnD에서 쓴 배치라 일관된다.

## 기각된 대안

- **TanStack Table을 ui 안에 넣고 감싸기**: 정렬·필터·열 숨김이 바로 되지만 경계 결정 변경·peer 의존성 추가·API 면적 증가. 지금 쓸 자리가 없는데 비용만 먼저 낸다.
- **자리가 생길 때까지 보류**: P7l 원칙에는 충실하나 0.3.0이 Pagination만으로 나가고 주말 계획에서 빠진다. 표는 자리가 분명(실행 이력·설정 › 모델)해서 선행해도 낭비가 작다.

## 배포 시 변화

없음(의존성·peer 변동 없음). galley-ui minor(0.3.0 후보).

## 결정일

2026-11-14

## 갱신 이력

- 2026-11-14 최초 결정(사용자 선택 A). 첫 실제 자리(실행 이력 표)는 다음 단위.
