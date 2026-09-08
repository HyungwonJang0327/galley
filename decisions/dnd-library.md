# ⑥ DnD: pragmatic-drag-and-drop (apps/dashboard 배치)

## 결정

큐 순서 변경은 pragmatic-drag-and-drop으로 구현하고 `apps/dashboard`에 둔다. `@galley/ui`의 `ListRow`는 드래그 핸들 props/ref만 받는 표현 컴포넌트로 유지한다.

## 이유

- 경량·접근성·프레임워크 무관·유지보수 활발.
- 큐 순서 변경은 도메인 동작 → ui 경계(도메인 단어 금지)를 지키려 앱에 배치.

## 기각된 대안

- **dnd-kit**: 인기·예제 많으나 무겁고 유지보수 정체 우려.
- **직접(HTML5 DnD)**: 접근성·UX 직접 구현 부담.
- **ui에 Sortable 넣기**: ui가 도메인 큐 동작을 알게 됨 → 경계 위반.

## 배포 시 변화

없음(클라이언트 전용).

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
