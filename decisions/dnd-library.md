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
- 2026-09-12 **구현(A6a)**: `@atlaskit/pragmatic-drag-and-drop` 설치, 대기 탭에서만 핸들 노출. `ListRow`는 `ComponentProps<'li'>`를 `<li>`에 넘기므로 React 19에서 `ref`가 그대로 전달돼 **ui 수정 없이** 드래그 대상이 됐다(도메인 무지 유지). 후보 섹션은 `###` 소제목 때문에 순서 변경을 거부한다(decisions/queue-sync-direction.md 섹션 이동 규칙과 같은 제약).
- 2026-09-12 **자동 검증 한계**(사용자 결정: 수동 확인): 이 라이브러리는 브라우저 **네이티브** 드래그를 쓰므로 페이지에서 만든 `DragEvent`(`isTrusted: false`)로는 동작하지 않는다 — 실측 스크립트로 드래그를 재현하려면 `cdp.mjs`에 `Input.setInterceptDrags`·`Input.dispatchDragEvent`가 필요. 지금은 드롭 위치 계산·서버·pipeline을 단위/통합 테스트로 덮고, 핸들 노출 범위만 실측하며, 끌어보는 조작은 사람이 확인한다.
