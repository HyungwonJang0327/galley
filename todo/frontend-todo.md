# frontend todo

상세·상태는 [mvp-todo.md](./mvp-todo.md). `apps/dashboard`만. `@galley/ui` 공개 배럴로만 소비, 파이프라인 실행은 `@galley/pipeline` 함수 호출.

## Phase 1-A

- A3b — 사이드바 메뉴 정의 + layout.tsx 셸 배선(활성 URL 기준)
- A3c — 루트 redirect + Phase 2 자리 라우트
- A3d — 사이드바 접힘 localStorage
- AG — /design 컴포넌트 갤러리(셸 안, A3 이후)
- AN1 — TopBar 워크스페이스 탭 제거
- AN2 — 사이드바 사용 흐름 순 재구성 + 구 라우트 5개 redirect
- AN3 — 루트 진입 분기(승인 대기 유무)
- AN4 — 큐 탭 4개(?tab=) + 카테고리 필터 (선행 A5a·A5b)
- AN5 — 행 ⋮ 이동/실행 메뉴
- AN6 — Phase 2 빈 페이지(/runs/history·/publish)
- AN7 — 큐 헤더 "파일에서 다시 불러오기"(파일→DB 수동 재적재, AI 호출 없음)
- AH2 — 사이드바 홈 항목 + TopBar Galley→/ 링크
- AH3 — 홈 골격(app/(dashboard)/page.tsx, 기존 redirect 삭제 → AN3/A3c 대체) + 다음 스케줄 유틸 + StatTile 4개
- AH4 — 홈 "다음 실행" 카드(대기 큐 A4d 연결)
- AH5 — 홈 "지금 할 일"·"최근 실행" 카드 **(B1e Run 스키마 뒤 보류)**
- AH6 — 홈 "발행 대기" 카드 빈 상태 **(Phase 2 뒤 보류)**
- A5b — 상태→Badge variant 매핑 어댑터(`lib/`)
- A5c — 큐 데이터 페칭(섹션별) → AN4 탭·A5a 행에 공급
- A6a — 큐 순서 DnD(pragmatic-drag-and-drop)
- A6b — 섹션 이동 액션
- A6c — 편집→주제_큐.md 반영(pl과 함께)

## Phase 1-B

- [x] A7 — 404·에러·로딩 화면(셸 유지) (2026-09-12, PR #85)
- A6e — "파일에서 사라짐" 확인 UI(missingSince 항목 → 보류로 옮기기/그대로 두기, 보류 탭 holdReason 구분)
- 🔒 B2c — 실행 상세 2분할 화면 ← **직접 작성 핵심 모듈, 구현 금지**(사용자 작성, AI는 테스트·리뷰만)
- B2d — 하단 ActionBar 배선
- B2e — 타임라인 펼침 산출물 마크다운 미리보기
- BM5 — Settings.defaultModelId + TopBar 칩 label 표시
- BM6 — 실행 시작 Dialog(모델 Select) + 진입점 3곳 (선행 UM1)
- BM7 — 실행 상세 타임라인 모델·비용 표시
- BM8 — 재실행 시 모델 변경(ActionBar Select)
- BM9 — TopBar 칩 클릭 기본 모델 변경
- BW4 — 수정 지시·승인·재실행을 Run 상태 변경으로(워커 pickup, B2b에서 미룬 몫 — 선행 B1a)
- BW6 — TopBar 워커 생존 점
- BE12 — 큐 행 ⋮ "근거 편집" Dialog + 실행 Dialog(BM6) 근거 목록·0건 경고 (decisions/evidence-collection.md, 선행 BE7·UM1)
- BE13 — 실행 상세 타임라인 6줄: 근거 수집·근거 검증 줄 펼침 표시 + 좌 목록·홈 "지금 할 일" "근거 없음 n" (선행 B2c·BE10)
- (Phase 2) /settings/repos — 리포 행(상태·분석 글 n·재인덱싱)·폴더 추가·진행률
