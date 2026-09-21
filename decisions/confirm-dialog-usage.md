# useConfirm 사용 규칙 — RunActionBar 치환(P4-11)에서 정한 여섯 가지

## 결정

1. **footer 버튼 크기는 md(Button 기본)로 통일.** useConfirm에 `size` 옵션을 두지 않는다. RunActionBar의 확인 Dialog 버튼(현재 sm)은 md로 바뀐다.
2. **확인을 누르면 즉시 닫힌다.** `await confirm()`은 "사용자가 무엇을 골랐나"에만 답한다. 그 뒤 비동기 작업(API 호출)이 도는 동안의 진행 표시는 소비자가 맡는다 — RunActionBar는 이미 있는 `pending`으로 컨트롤을 비활성하고, 바 아래 `role="status"`에 "요청 중" 문구를 띄운다.
3. **`ConfirmOptions.children?: ReactNode`를 추가한다.** Dialog가 이미 가진 본문 슬롯을 그대로 연다. 재실행 Dialog의 계획 표(`<dl>`)가 여기에 들어간다 — `description`은 `<p>`라 블록 요소를 넣을 수 없다.
4. **Provider(전역 렌더) 방식은 0.1.0에 넣지 않는다.** 소비자가 `{element}`를 한 번 렌더하는 지금 방식 유지. 나중에 필요해지면 "Provider가 위에 있으면 훅이 거기에 그리고 `element`는 null, 없으면 지금처럼"으로 **호환되게** 추가할 수 있다(breaking 아님).
5. **문자열 한 개 축약 호출(`confirm('...')`)은 두지 않는다.** 시그니처는 `confirm(options)` 하나.
6. **`useAlert`를 지금 추가한다.** `alert({ title, description?, confirmLabel?, tone? }): Promise<void>` — 확인 버튼 하나, Esc·바깥 클릭·닫기도 그냥 resolve. `useAwaitDialog<void>` 위에 얹는다. 같은 폴더 `hooks/useAwaitDialog/useAlert.tsx`.

## 이유

- 1: 디자인 시스템의 자기 예시(갤러리 DialogDemo)가 md다. Dialog마다 크기가 다른 옵션을 열 이유가 없고, sm은 RunActionBar가 바(ActionBar) 버튼 크기를 그대로 따라 쓴 국지적 선택이었다.
- 2: 훅이 비동기 작업까지 알면(열어 둔 채 버튼 비활성·작업 실패 시 처리) `useAwaitDialog` 위의 얇은 훅에서 벗어나고 Promise 결과도 boolean이 아니게 된다. 사용자가 비교한 사이드 프로젝트의 `useDialog`도 확인 시점에 resolve하고 이후는 호출 쪽이 맡는 구조였다. 로컬 API라 기다리는 구간이 짧다.
- 3: P0c 결정("RunActionBar Dialog 2개 → useConfirm")을 지키려면 계획 표를 넣을 자리가 필요하다. 재실행만 `useAwaitDialog` 직접 사용으로 빼는 대안은 소비자에 훅 둘·Dialog JSX 하나가 남아 "useState 두 벌 → 훅 하나"라는 P4-11의 목적에 못 미친다. 0.1.0 전이라 옵션 추가가 무료다.
- 4: 소비자가 하나(RunActionBar)인 지금 Provider 필요성을 판단하기엔 이르다. ToastProvider도 아직 앱 셸에 없다. 나중에 호환되게 추가할 수 있으므로 미루는 비용이 없다.
- 5: 옵션이 필요해지는 순간 결국 객체로 바꿔야 해 두 형태가 공존한다. `confirm({ title })`은 글자 몇 개 차이다.
- 6: 사용자 결정(2026-09-21). 사이드 프로젝트 `useDialog`와 구색을 맞추고, 소비자가 나타났을 때 만드는 것보다 useConfirm과 같은 PR에서 같은 규칙(초기 포커스·tone·라벨)으로 만드는 것이 일관성에 유리하다.

## 기각된 대안

- 1: `size` 옵션 / useConfirm 기본을 sm으로.
- 2: `confirm({ onConfirm: () => Promise })`로 작업이 끝날 때까지 열어 두고 버튼 비활성 — 필요한 소비자가 생기면 additive로 추가 가능.
- 3: 재실행은 `useAwaitDialog` 직접(P0c와 부분 어긋남) / 계획을 description 문자열로 평탄화(정보 손실).
- 4: `ConfirmProvider` 지금 도입 + `useConfirm`이 `confirm`만 반환.
- 5: `string | ConfirmOptions` 오버로드.
- 6: alert 보류(소비자 없음) — 사용자가 뒤집음.

## 결정일

2026-09-21 (사용자: ①③④⑤ 추천대로, ② (a)+상태 문구, ⑥ 지금 진행)

## 갱신 이력

- 2026-09-21 최초 결정.
