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

- [x] **AG** (2026-09-08 `30ad8b5`) fe — `app/(dashboard)/design/page.tsx` 갤러리: 셸 안에서 `@galley/ui` 공개 배럴로 Button·Badge·Card·PageHeader를 variant/size/상태별 렌더. 서버 컴포넌트, 도메인 무지. nav 링크는 개발 서버 전용으로 노출(`181fdaf`, 프로덕션 빌드 제외). 커밋: `feat(dashboard): 컴포넌트 갤러리 /design 라우트 추가`
  - 완료조건: `/design`이 셸 안에서 렌더, 기존 컴포넌트(Button·Badge·Card·PageHeader 등)가 상태별로 보임.

### A4. DB 접근 계층 + 큐 적재

- [x] **A4a** (2026-09-08 `da9c381`) pl — Prisma·SQLite 도입 + 초기 스키마(QueueItem: status 대기/후보/보류/완료 문자열, order). `.env` DATABASE_URL. Prisma 6.19.3 핀(7↑ datasource.url 제거 충돌 — decisions/toolchain-pins.md). 커밋: `feat(pipeline): Prisma·SQLite 스키마와 클라이언트 추가`
- [x] **A4b** (2026-09-09 `0b2534d`) pl — 주제_큐.md 파서·라이터(Storage 인터페이스 + LocalFsStorage). 섹션 구조·줄 순서·완료 날짜 유지. 라운드트립은 "구조상 동일"(빈 줄 정규화). 커밋: `feat(queue): 주제_큐.md 파서·라이터 추가`
- [x] **A4c** (2026-09-09 `d73e72c`) ts — 파서 라운드트립 테스트(read→수정→write→re-read 동일) 픽스처. 커밋: `test(queue): 주제_큐.md 파서 라운드트립 테스트`
- [x] **A4d** (2026-09-09 `1a7d0f7`·`a9419bd`·`03c7deb`) pl — 파일→DB 재적재(전체 리셋: 트랜잭션 deleteMany+createMany). `category`·`completedOn` 컬럼 + 마이그레이션, 파서 QueueTopic 전 필드 보존. 실제 임시 SQLite 통합 테스트. 주제 키는 재적재에 안정한 슬러그로(id ✗) — 파생 구현은 B1e. 커밋: `feat(queue): 주제_큐.md를 SQLite로 적재`

### AN. 네비게이션·화면 구조 재정비 (fe · 사용 흐름 IA — decisions/navigation.md) — A5·A6보다 먼저

레이아웃 스펙 [C]의 정보 종류별 사이드바를 글의 생애주기(사용 흐름) 순으로 재구성. 문서(decisions/navigation.md·layout.md §2~§4·planning 라우트 표·CLAUDE) 선반영 완료. 각 항목 = 커밋 하나.

- [x] **AN1** (2026-09-09 `db2e8d6`) fe — TopBar 워크스페이스 탭(글/설정) 제거 + 관련 코드 정리. 커밋: `refactor(dashboard): TopBar 워크스페이스 탭 제거`
  - 완료조건: TopBar에 `[☰]·Galley·모델 칩`만. 글/설정 pill·`isSettings`·미사용 import(useRouter·usePathname) 제거. 워크스페이스 라우트 그룹/상태 없음(TopBar.tsx에 국한 확인됨). build 통과.
- [x] **AN2** (2026-09-09 `1b31aef`) fe — 사이드바 메뉴 정의를 새 구성으로 교체 + 구 라우트 5개 redirect(**next.config redirects**). 커밋: `feat(dashboard): 사이드바를 사용 흐름 순으로 재구성`
  - 완료조건: 메뉴 7개(주제:큐 / 실행:실행·이력 / 발행:발행 대기 / 설정:리포·모델·프롬프트) + 외부 2개 렌더, /queue/candidates·/queue/done·/runs/active·/publish/zenn·/publish/velog 5개가 전부 새 경로로 redirect(308 스모크 확인), 배지 자리 있음(값 미주입. 실값은 사이드바 서버 컴포넌트에서 직접 조회).
- [x] **AN3** (2026-09-09 `2b4a51a`) fe — 루트 진입 분기(승인 대기 ≥1 → /runs, else /queue). 커밋: `feat(dashboard): 루트 진입 시 승인 대기 여부로 분기`
  - 완료조건: 루트 `/`가 승인 대기 유무로 분기(스모크 `/`→`/queue`). Run 스키마(B1e) 전까지 카운트 0/더미(`getPendingApprovalCount`) → 사실상 /queue. 홈 화면 없음.
- [ ] **AN4** fe — 큐 화면 탭 4개(?tab=) + 카테고리 필터. **의존: A4b(주제_큐.md 파서)·A5a(ListToolbar·ListRow)** — 둘 다 미완이라 보류(가짜 데이터/행 금지). 커밋: `feat(queue): 큐 화면에 대기·후보·보류·완료 탭 추가`
  - 완료조건: 탭 4개가 주제_큐.md 섹션 4개와 1:1로 읽히고, ?tab=로 새로고침해도 유지. 카테고리 = 후보 섹션 `###` 소제목.
- [ ] **AN5** fe — 행 ⋮ 메뉴(섹션 이동 / 지금 실행). **의존: AN4 행**(A4b·A5a). 커밋: `feat(queue): 주제 행 이동 메뉴 추가`
  - 완료조건: 행 ⋮에서 대기로/후보로/보류로/지금 실행 노출·배선. (파일 반영 로직은 A6c와 연계.)
- [x] **AN6** (2026-09-09 `6bd4c6c`) fe — Phase 2 빈 페이지 신설(/runs/history·/publish). 커밋: `chore(dashboard): Phase 2 빈 페이지 라우트 추가`
  - 완료조건: /runs/history·/publish 자리 페이지(Placeholder) 존재(200 스모크), 설정 3개는 기존 유지. 메뉴 링크 유효.

> 실행 화면(2분할)·산출물 미리보기는 Phase 1-B B2에서. B2에 "타임라인 펼침 산출물 미리보기"(B2e)만 추가, 순서 유지.

### AH. 홈(요약 대시보드) — 루트 `/` (decisions/navigation·layout "요약형") — 2026-09-09 결정 변경

목록형(A)의 변형 "요약형". **분할 구현**: 카드 6개 중 4개가 Run(B1e)·Phase 2 데이터라 영구 빈 상태 → 지금은 뼈대+실데이터(대기 큐, A4d)만. 승인 대기·최근 실행·발행 대기 카드는 데이터 도착 후(AN4/AN5 선례: 가짜 데이터 금지). 각 항목 = 커밋 하나.

- [ ] **AH1** ui — `StatTile`(label·value·href·tone default|warning·icon 슬롯) + `EmptyState`(한 줄 메시지+선택 액션 버튼, 큐·실행·발행 빈 상태 재사용). 테스트·스토리. `CardGrid`(columns·비율 grid 래퍼)는 기존 Card 조합으로 충분하면 만들지 말고 이유 보고. 커밋: `feat(ui): StatTile·EmptyState 컴포넌트 추가`
- [ ] **AH2** fe — 사이드바 맨 위 단독 "홈" 항목(lucide LayoutDashboard)+구분선, TopBar Galley→/ 링크. 커밋: `feat(dashboard): 사이드바에 홈 항목 추가`
- [ ] **AH3** fe — 홈 페이지 골격: `app/(dashboard)/page.tsx`(기존 `app/page.tsx` redirect 삭제) · h1 "홈" · 다음 스케줄 시각(수·토 18:00 중 가까운 쪽, TZ .env, **계산 apps/dashboard 유틸**) · StatTile 4개. 카운트는 배지와 같은 소스(`lib/nav-counts`, 대기 n은 A4d `QueueItem`, 승인 대기·발행·비용은 더미/"—"). 갱신=서버 렌더+네비게이션. 커밋: `feat(dashboard): 홈 페이지 골격과 요약 타일 추가`
  - 완료조건: `/` 진입 시 타일 4개 숫자가 사이드바 배지와 같다. 타일 클릭으로 각 화면 이동.
- [ ] **AH4** fe — "다음 실행" 카드(대기 큐 A4d 데이터 연결: 맨 위 1개 크게 + 2~4위 작은 행, `지금 실행`은 pipeline 호출 자리만, 빈 상태 EmptyState). 작은 행은 A5a `ListRow` 재사용(선행 시) 또는 최소 마크업. 커밋: `feat(dashboard): 홈에 다음 실행 카드 추가`
  - 완료조건: 주제_큐.md 대기 맨 위 항목이 카드에 뜨고, 큐 순서를 바꾸면 홈도 바뀐다.
- [ ] **AH5** fe — "지금 할 일"·"최근 실행" 카드. **의존: B1e(Run 스키마)** — 그 전까지 두 카드 모두 EmptyState. **B1e 뒤로 보류**(지금 만들면 행 구조 재작업). 커밋: `feat(dashboard): 홈에 승인 대기·최근 실행 카드 추가`
  - 완료조건: 실행 0건에서 두 카드 빈 상태, 레이아웃 안 무너짐.
- [ ] **AH6** fe — "발행 대기" 카드 빈 상태 + Phase 2 TODO. **Phase 2 데이터 의존, 뒤로 보류.** 커밋: `feat(dashboard): 홈에 발행 대기 카드 자리 추가`

### A5. 큐 목록 화면 (패턴 A) — [B] Phase 1-A #3

- [ ] **A5a** ui — ListToolbar·ListRow 패턴(검색·필터·체크박스 슬롯 / 행: 제목+보조+우측 배지·시간). 도메인 무지. 커밋: `feat(ui): ListToolbar·ListRow 패턴 추가`
- [ ] **A5b** fe — 상태→Badge variant 매핑 어댑터(`lib/`). 커밋: `feat(dashboard): 큐 상태→Badge variant 매핑 추가`
- [ ] **A5c** fe — 큐 데이터 페칭(pipeline에서 섹션별 주제 로드) → AN4 탭 + A5a 행에 공급. (기존 "3화면" 폐지 — 1화면+탭은 AN4.) 커밋: `feat(dashboard): 큐 데이터 페칭 배선`
  - 완료조건: 대기/후보/보류/완료 섹션 데이터가 탭별로 렌더된다.

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
- [ ] 🔒 **B1c** 모델 어댑터 인터페이스 → **BM1~BM3로 재구성**(인터페이스 🔒 + Mock·레지스트리·Claude 2개). 아래 BM 참조.
- [ ] **B1d** ts — 어댑터 목 토큰·비용 테스트 → **BM1·BM3에 흡수**.
- [ ] **B1e** pl — Run 스키마 → **BM4(modelId·RunStep 비용) + BW1(워커 상태·heartbeat)로 확장**. 아래 참조.
- [ ] **B1f** pl — 단계 실행 오케스트레이션 → **BW2 워커 루프가 담당**(별도 프로세스 — decisions/run-location.md).

### BM. 실행별 모델 선택 — [B] Phase 1-B (decisions/model-selection.md) · B1↔B2 사이

모델은 Run 속성. BM1~~BM3(어댑터 계층)은 Run 스키마와 독립 → B1 초반에 착수 가능. BM4~~BM9는 Run 스키마(BM4)·실행 화면(B2)에 의존. 각 항목 = 커밋 하나.

- [ ] 🔒 **BM1** pl — `ModelAdapter` 인터페이스(**사용자 작성**, AI는 초안) + Mock 어댑터(고정 텍스트·비용 0, dev 전용 노출) + 테스트. 커밋: `feat(model): 모델 어댑터 인터페이스와 Mock 어댑터 추가`
- [ ] **BM2** pl — `ModelRegistry`(list/get/default, `available` 판정=API 키 유무). 커밋: `feat(model): 모델 레지스트리 추가`
  - 완료조건: `.env`에서 API 키를 지우면 해당 어댑터가 `available:false`(테스트).
- [ ] **BM3** pl — Claude 어댑터 2개(상위+저렴, **모델 id·단가는 Anthropic 문서 확인→사용자 확정 후 상수화**) + usage→cost 테스트. 커밋: `feat(model): Claude 어댑터와 비용 계산 추가`
  - 완료조건: 고정 usage 입력에 costUsd가 단가표와 일치(테스트). **실제 API 호출 테스트는 안 만듦**(비용) — Mock만.
- [ ] **BM4** pl — 스키마: `Run.modelId` + `RunStep`(modelId·inputTokens·outputTokens·costUsd·durationMs) 컬럼 + 마이그레이션. totalCost는 미저장(합산). 커밋: `feat(run): 실행·단계에 모델과 비용 기록 컬럼 추가` _(BW1과 한 마이그레이션으로 합칠 수 있음)_
- [ ] **BM5** fe — `Settings.defaultModelId`(SQLite settings 테이블) + TopBar 칩에 label 표시(변경은 BM9). 커밋: `feat(dashboard): 기본 모델 설정과 TopBar 칩 표시`
- [ ] **BM6** fe — 실행 시작 Dialog(모델 Select, available=false 비활성+툴팁, 예상 비용 미표시) + 진입점 3곳(큐 행 ⋮·맨 위 실행·홈 다음 실행) 연결. **선행: ui Dialog·Select 프리미티브(UM1).** 커밋: `feat(dashboard): 실행 시작 시 모델 선택 Dialog 추가`
  - 완료조건: 세 진입점 모두 같은 Dialog, 선택 modelId가 Run에 저장, available=false는 선택 불가.
- [ ] **BM7** fe — 실행 상세 타임라인에 모델 label·비용(USD 4자리) 표시(단계 모델이 Run과 다르면 그 줄에만 label). 커밋: `feat(dashboard): 실행 상세에 모델과 비용 표시`
- [ ] **BM8** fe — 재실행 ActionBar에 모델 Select(초기값=원래 모델) → 그 `RunStep.modelId`만 변경. 커밋: `feat(dashboard): 단계 재실행 시 모델 변경 지원`
  - 완료조건: 한 단계만 다른 모델로 재실행 시 그 RunStep.modelId만 바뀌고 Run.modelId 유지.
- [ ] **BM9** fe — TopBar 칩 클릭 → Select로 기본 모델 변경(Settings 갱신, 실행 중 Run엔 영향 없음 툴팁). 커밋: `feat(dashboard): TopBar 칩에서 기본 모델 변경`

### BW. 워커 실행 — [B] Phase 1-B (decisions/run-location.md) · B1↔B2 사이

별도 워커 프로세스. **선행: 상태 머신(B1a 🔒)·Run 스키마(BM4).** 대시보드는 Run을 queued로 만들 뿐. 각 항목 = 커밋 하나.

- [ ] **BW1** pl — Run 실행 상태(queued/running/interrupted) + `workerId`·`heartbeat` 컬럼 + 마이그레이션. 커밋: `feat(run): 워커 실행 상태·heartbeat 컬럼 추가`
- [ ] **BW2** pl — 워커 루프(`bin/worker.ts`): queued→running 클레임, 단계 오케스트레이션(레지스트리 어댑터 호출·RunStep 기록·heartbeat), 동시 1개. 폴링 2s·heartbeat 5s. 커밋: `feat(pipeline): 워커 프로세스 실행 루프 추가`
- [ ] **BW3** pl — 중단 감지·재개(heartbeat 30s 공백→interrupted, 완료 단계 다음부터; 기동 시+깨어날 때 검사, 단계는 원자적). 커밋: `feat(pipeline): 워커 중단 감지와 단계 재개 추가`
  - 완료조건: running 워커를 강제 종료→재기동 시 완료 단계 다음부터 재개, 중간 단계는 처음부터.
- [ ] **BW4** fe — 수정 지시·승인을 Run 상태 변경으로(대시보드 write → 워커 pickup). _(B2b/B2d와 연동)_ 커밋: `feat(run): 수정 지시·승인을 Run 상태로 표현`
- [ ] **BW5** doc — launchd plist 템플릿 + `docs/worker-setup.md`(KeepAlive·로그 경로·.env 로드, 잠자기 방지 안 함). 커밋: `docs: 워커 launchd 설치 문서와 plist 템플릿`
- [ ] **BW6** fe — TopBar 칩 옆 워커 생존 점(최근 heartbeat 타임아웃 판정). 커밋: `feat(dashboard): TopBar에 워커 생존 표시 추가`

### B2. 실행 상세 2분할 화면(패턴 B) — [B] Phase 1-B #6

- [ ] **B2a** ui — SplitPane·TimelineItem·ActionBar 패턴(도메인 무지). 커밋: `feat(ui): SplitPane·Timeline·ActionBar 패턴 추가`
- [ ] **B2b** fe — 실행·재실행·승인 Route Handler(pipeline 함수 호출만). 커밋: `feat(run): 실행·재실행·승인 Route Handler 추가`
- [ ] **B2c** fe — 2분할 화면: 좌 목록(검색·탭 실행중/완료·"승인 대기만" 체크) / 우 타임라인(단계 순서 고정). 커밋: `feat(dashboard): 실행 상세 2분할 화면 추가`
- [ ] **B2d** fe — 하단 ActionBar(수정 지시 입력 + 승인) → Route Handler 배선. 커밋: `feat(run): 실행 상세 수정 지시·승인 배선`
  - 완료조건([B]#6): 좌 목록 선택→우 타임라인 전환, 하단 바 입력이 pipeline 함수 호출로 이어짐.
- [ ] **B2e** fe — 타임라인 항목 펼침 시 그 단계 산출물 마크다운 렌더(검수 필수). 렌더러 = **react-markdown**(apps/dashboard). 커밋: `feat(dashboard): 실행 타임라인 산출물 미리보기 추가`

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
