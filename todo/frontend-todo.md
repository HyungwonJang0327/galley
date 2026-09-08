# frontend todo

상세·상태는 [mvp-todo.md](./mvp-todo.md). `apps/dashboard`만. `@galley/ui` 공개 배럴로만 소비, 파이프라인 실행은 `@galley/pipeline` 함수 호출.

## Phase 1-A

- A3b — 사이드바 메뉴 정의 + layout.tsx 셸 배선(활성 URL 기준)
- A3c — 루트 redirect + Phase 2 자리 라우트
- A3d — 사이드바 접힘 localStorage
- AG — /design 컴포넌트 갤러리(셸 안, A3 이후)
- A5b — 상태→Badge variant 매핑 어댑터(`lib/`)
- A5c — 큐 목록 3화면(대기·후보·완료)
- A6a — 큐 순서 DnD(pragmatic-drag-and-drop)
- A6b — 섹션 이동 액션
- A6c — 편집→주제_큐.md 반영(pl과 함께)

## Phase 1-B

- B2b — 실행·재실행·승인 Route Handler
- B2c — 실행 상세 2분할 화면
- B2d — 하단 ActionBar 배선
