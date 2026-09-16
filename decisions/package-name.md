# npm 패키지명: `galley-ui` (unscoped)

## 결정

- `packages/ui`의 npm 배포명은 **`galley-ui`**(unscoped). 워크스페이스 패키지명도 옛 `@galley` 스코프명에서 `galley-ui`로 통일한다(코드·설정·문서 전부, worklog/는 날짜별 기록이라 제외).
- `@galley/pipeline`은 비공개(`private`)라 이름을 유지한다.
- 첫 공개 버전은 0.1.0(changesets minor). 배포 절차·완료 조건은 todo/mvp-todo.md Phase P.

## 이유

- npm 유저 `galley`(트위터 계정, `galley` 패키지 maintainer)가 이미 존재해 **`@galley` 스코프를 쓸 수 없다.** 워크스페이스 이름과 배포명이 다르면 import 경로·문서·CI 필터가 두 벌이 되므로 워크스페이스 이름도 배포명에 맞춘다.
- `galley-ui`는 미등록 확인(2026-09-15, `npm view galley-ui` 404).
- npm 유사 이름 차단 규칙(구두점·대소문자만 다른 이름 거부)에 걸리지 않는다 — `galley`와는 `-ui`가 붙어 별개 이름이다.

## 기각된 대안

- **`@<내 유저명>/galley-ui`**: 개인 패키지처럼 보인다. 디자인 시스템으로 독립 배포한다는 프레이밍(decisions/ui-package-boundary.md)과 맞지 않는다.
- **새 조직 `@galley-ui/*`**: 조직 생성 단계가 추가되고, 패키지가 하나뿐이라 스코프의 이점이 없다.

## 결정일

2026-09-15

## 갱신 이력

- 2026-09-15 최초 결정.
- 2026-09-16 P1a 코드·설정 치환 완료(`2bf988e`, chore/ui-rename). 문서·에이전트 치환은 P1b.
- 2026-09-16 P1b 문서·에이전트·커맨드 치환 완료(worklog/ 제외).
