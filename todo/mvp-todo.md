# mvp-todo — Phase 1 (2주)

전체 마스터. 상세·상태의 단일 출처. 역할별 todo는 이 파일의 ID를 가리킨다.
규칙은 [todo/README.md](./README.md). 각 항목 = 커밋 하나 크기. 완료 시 `[x]` + 날짜·해시.

- 상태: `[ ]` 대기 · `[~]` 진행 · `[x]` 완료
- 🔒 = **직접 작성**(사용자 구현, 에이전트는 테스트·리뷰만 — decisions/core-modules.md)
- 담당: ui=ui-engineer · fe=frontend · pl=pipeline · ts=tester

## 완료 (7-2 기반)

- [x] 모노레포 뼈대 + `@galley/ui` 폴더 구조·tsup·exports·no-restricted-imports (2026-09-08 `bf79030`)
- [x] `@galley/pipeline`·`apps/dashboard` 스캐폴드 (2026-09-08 `2dc3c2a`·`efe8223`)
- [x] CI·gitleaks·main 보호 (2026-09-08 `2f638db`·`151ce31`)

---

## Phase 1-A · 1주차 (화면 골격 + 큐)

### A1. 디자인 토큰 — ui

- [x] **A1** (2026-09-08 `97b55bb`) color·spacing·typography·radius·shadow를 `--ui-*` CSS 변수로. 레이아웃 스펙 §1(#F5F6F8·카드 흰색·블루 #5B6CFF·본문 13~~14/제목 20~~22)·§5(배지 색) 기준. 라이트 값 + 다크 자리.
  - 완료조건: `tokens/`가 CSS 변수 파일 export, ui build 산출물에 CSS 포함, index에서 스타일 진입점 노출. build·typecheck 통과. 하드코딩 색·px 없음.
  - 커밋: `design(ui): 색·간격·타이포·라운드·그림자 토큰 추가`

### A2. 기본 컴포넌트(직접 작성) — ui (각 컴포넌트 = 폴더+테스트+스토리, 토큰만 참조)

- [x] **A2a** (2026-09-08 `70fcf28`) Button — variant·size. 커밋: `feat(ui): Button 컴포넌트 추가`
- [x] **A2b** (2026-09-08 `44e49cf`) Badge — variant(회색/블루/주황/초록/빨강 + 펄스). ui는 variant 이름만. 커밋: `feat(ui): Badge 컴포넌트 추가`
- [x] **A2c** (2026-09-08 `08c3047`) Card — 커밋: `feat(ui): Card 컴포넌트 추가`
- [x] **A2d** (2026-09-08 `fa741df`) PageHeader(h1+여백) — 커밋: `feat(ui): PageHeader 컴포넌트 추가`
  - 완료조건(공통): index 배럴 export, `X.test.tsx` 통과, ui build 통과.

### A3. AppShell + TopBar + Sidebar 골격

- [x] **A3a** (2026-09-08 `f56db05`) ui — AppShell(TopBar+Sidebar 슬롯)·SidebarGroup·SidebarItem·TopBarChip 패턴(표현 전용, `isActive` prop). 커밋: `feat(ui): AppShell·Sidebar·TopBar 패턴 추가`
- [x] **A3b** (2026-09-08 `7f8adc0`) fe — 사이드바 메뉴 정의(라벨·경로·아이콘 배열 1개) + `app/(dashboard)/layout.tsx`에 셸 배선, 활성 판정 URL(pathname). 커밋: `feat(dashboard): 대시보드 레이아웃 셸과 사이드바 메뉴 배선` (+ CI 소비 전 ui 빌드 `80255c3`)
- [x] **A3c** (2026-09-08 `279ac01`) fe — 루트 `page.tsx`→`/queue` redirect + Phase 2 자리 라우트(발행·설정) 스텁. 커밋: `feat(dashboard): 루트 redirect와 Phase 2 자리 라우트 추가`
- [x] **A3d** (2026-09-08 `421ca5f`) fe — 사이드바 접힘 localStorage + 하이드레이션 플래시 방지 인라인 스크립트. TopBar ☰ 토글, `SidebarProvider` 컨텍스트, `<body>` 인라인 스크립트+`globals.css`로 폭 플래시 방지. `@galley/ui` 미변경. 커밋: `feat(dashboard): 사이드바 접힘 localStorage 저장`
  - 완료조건(A3 전체, [B]§7): 스펙 §3 메뉴 전부 렌더, URL 이동 시 활성 바뀜, 접힘 토글 동작. 데이터 없음.

### AG. 컴포넌트 갤러리 (/design) — fe · A3 이후 (decisions/component-gallery.md)

- [x] **AG** (2026-09-08 `30ad8b5`) fe — `app/(dashboard)/design/page.tsx` 갤러리: 셸 안에서 `@galley/ui` 공개 배럴로 Button·Badge·Card·PageHeader를 variant/size/상태별 렌더. 서버 컴포넌트, 도메인 무지. nav 링크는 미추가(노출 위치 미결). 커밋: `feat(dashboard): 컴포넌트 갤러리 /design 라우트 추가`
  - 완료조건: `/design`이 셸 안에서 렌더, 기존 컴포넌트(Button·Badge·Card·PageHeader 등)가 상태별로 보임.

### A4. DB 접근 계층 + 큐 적재

- [ ] **A4a** pl — Prisma·SQLite 도입 + 초기 스키마(QueueItem: status 대기/후보/보류/완료 문자열, order). `.env` DATABASE_URL. 커밋: `feat(pipeline): Prisma·SQLite 스키마와 클라이언트 추가`
- [ ] **A4b** pl — 주제_큐.md 파서·라이터(Storage 인터페이스 + LocalFsStorage). 섹션 구조·줄 순서·완료 날짜 유지. 커밋: `feat(queue): 주제_큐.md 파서·라이터 추가`
- [ ] **A4c** ts — 파서 라운드트립 테스트(read→수정→write→re-read 동일) 픽스처. 커밋: `test(queue): 주제_큐.md 파서 라운드트립 테스트`
- [ ] **A4d** pl — 파일→DB 최초 임포트 + 로드 시 재적재(파일이 진실, decisions/queue-sync-direction). 커밋: `feat(queue): 주제_큐.md를 SQLite로 적재`

### A5. 큐 목록 화면 (패턴 A) — [B] Phase 1-A #3

- [ ] **A5a** ui — ListToolbar·ListRow 패턴(검색·필터·체크박스 슬롯 / 행: 제목+보조+우측 배지·시간). 도메인 무지. 커밋: `feat(ui): ListToolbar·ListRow 패턴 추가`
- [ ] **A5b** fe — 상태→Badge variant 매핑 어댑터(`lib/`). 커밋: `feat(dashboard): 큐 상태→Badge variant 매핑 추가`
- [ ] **A5c** fe — 큐 목록 3화면(대기 `/queue`·후보 `/queue/candidates`·완료 `/queue/done`), 같은 컴포넌트 조합, pipeline에서 데이터 페칭. 커밋: `feat(dashboard): 큐 목록 화면(대기·후보·완료) 추가`
  - 완료조건([B]#3): 4-A 패턴으로 3개 화면이 같은 컴포넌트 조합으로 렌더.

### A6. 큐 편집 — [B] Phase 1-A #4

- [ ] **A6a** fe — pragmatic-drag-and-drop 도입 + 대기 큐 순서 변경 UI. 커밋: `feat(dashboard): 큐 순서 변경 DnD 추가`
- [ ] **A6b** fe — 섹션 이동(후보↔대기↔보류) 액션. 커밋: `feat(queue): 큐 섹션 이동 액션 추가`
- [ ] **A6c** pl/fe — 편집 결과를 주제_큐.md에 반영(라이터, 섹션 구조 유지) + DB 갱신. 커밋: `feat(queue): 큐 편집을 주제_큐.md에 반영`
- [ ] **A6d** ts — 편집→파일 반영 무결성 테스트(양방향 어긋남 0). 커밋: `test(queue): 큐 편집 파일 반영 무결성 테스트`
  - 완료조건([B]#4): 순서 DnD·섹션 이동이 되고 주제_큐.md에 반영, 어긋남 0.

---

## Phase 1-B · 2주차 (파이프라인 + 실행 상세)

### B1. 상태 머신 + 모델 어댑터 + 실행 이력 — [B] Phase 1-B #5

- [ ] 🔒 **B1a** 단계 상태 머신 + 승인 게이트(실행→승인 대기→수정 재실행→완료). 커밋: `feat(pipeline): 단계 상태 머신과 승인 게이트 추가`
- [ ] **B1b** ts — 상태 머신 전이 테스트(정상·수정 재실행·불가 전이). 커밋: `test(pipeline): 상태 머신 전이 테스트`
- [ ] 🔒 **B1c** 모델 어댑터 인터페이스(교체 가능 + 토큰·비용 기록) + Claude 어댑터 첫 구현. 커밋: `feat(model): 모델 어댑터 인터페이스와 Claude 어댑터 추가`
- [ ] **B1d** ts — 어댑터 목으로 토큰·비용 기록 테스트. 커밋: `test(model): 모델 어댑터 토큰·비용 기록 테스트`
- [ ] **B1e** pl — Run 스키마(시각·모델·토큰·비용·결과·단계) + 저장·조회. 커밋: `feat(run): 실행 이력 스키마와 저장·조회 추가`
- [ ] **B1f** pl — 단계 실행 오케스트레이션(상태 머신이 각 단계에서 어댑터 호출 → 결과 기록). 커밋: `feat(pipeline): 단계 실행 오케스트레이션 추가`

### B2. 실행 상세 2분할 화면(패턴 B) — [B] Phase 1-B #6

- [ ] **B2a** ui — SplitPane·TimelineItem·ActionBar 패턴(도메인 무지). 커밋: `feat(ui): SplitPane·Timeline·ActionBar 패턴 추가`
- [ ] **B2b** fe — 실행·재실행·승인 Route Handler(pipeline 함수 호출만). 커밋: `feat(run): 실행·재실행·승인 Route Handler 추가`
- [ ] **B2c** fe — 2분할 화면: 좌 목록(검색·탭 실행중/완료·"승인 대기만" 체크) / 우 타임라인(단계 순서 고정). 커밋: `feat(dashboard): 실행 상세 2분할 화면 추가`
- [ ] **B2d** fe — 하단 ActionBar(수정 지시 입력 + 승인) → Route Handler 배선. 커밋: `feat(run): 실행 상세 수정 지시·승인 배선`
  - 완료조건([B]#6): 좌 목록 선택→우 타임라인 전환, 하단 바 입력이 pipeline 함수 호출로 이어짐.

### B3. 산출물 파일 쓰기 + 썸네일 — [B] Phase 1-B #7

- [ ] **B3a** pl — `posts/<슬러그>/` 5개 파일 쓰기(벨로그·링크드인·Zenn·발행정보·썸네일 자리) via Storage. 새 슬러그 폴더에만. 커밋: `feat(publish): posts 슬러그 폴더 산출물 쓰기 추가`
- [ ] **B3b** pl — ThumbnailRenderer 인터페이스 + make_thumb.py 호출 구현. 커밋: `feat(publish): 썸네일 렌더러(make_thumb.py 호출) 추가`
- [ ] **B3c** ts — 산출물 5개 구조·파일명 픽스처 테스트. 커밋: `test(publish): posts 산출물 구조 테스트`

---

## Phase 2로 미룸 (여기서 구현 안 함)

Zenn push 실연동 · 설정 화면(리포·모델·비용·어투 프롬프트) · 비용 칩 · AI 주제 후보 생성 · Storybook 실행 · 스케줄 DB 이전.

## 상시 역할

- reviewer: 각 기능 PR마다 `/review`.
- planner: planning.md·decisions/ 유지, 미결 추적.
- doc-writer: Phase 1 말 README 스크린샷·docs 사용법, 코드-문서 정합성.
