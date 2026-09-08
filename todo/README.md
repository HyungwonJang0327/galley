# todo/

**누가 다음에 무엇을 하나**(작업). 확정 목록은 `planning.md`, 일지는 `worklog/`.

## 규칙

- 에이전트별 `todo/{역할}-todo.md` + 전체 `todo/mvp-todo.md`.
- Phase 단위로 묶는다(Phase 1은 1-A/1-B).
- 각 항목은 **커밋 하나로 끝날 크기**로 쪼갠다. 항목마다:
  - 완료 조건
  - 예정 커밋 메시지 (`커밋: type(scope): subject`)
- 완료 시 날짜·커밋 해시 기록.
- "직접 작성" 태그가 붙은 항목(핵심 모듈)은 사용자가 구현하고 에이전트는 테스트·리뷰만.

## 역할

reviewer · planner · frontend · ui-engineer · pipeline · tester · doc-writer
