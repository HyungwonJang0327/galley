# 대시보드 레이아웃 스펙

원본: `~/Desktop/projects/대시보드_레이아웃_스펙.md`. **충돌 시 스펙 파일이 우선한다.** 전 직장 콘솔의 정보 구조만 참고(클린룸, 코드 미열람).

## 결정

아래 골격·패턴을 고정한다. 새 Content 패턴을 만들지 않는다.

### 1. 전체 골격

- TopBar(다크 #1F2126, 48px, 전체 폭) 고정 → 아래 Sidebar(흰 220~240px) + Content(#F5F6F8).
- 데스크톱 전용(min-width 1200), 라이트 테마만(다크는 토큰 자리만). 배경 #F5F6F8, 카드 흰색 라운드 8–12, 본문 13–14px, 제목 20–22px.
- 포인트 색 블루 1개(예 #5B6CFF) — 활성 탭·활성 메뉴·주요 버튼에만. 다른 곳 블루 금지.
- 값은 `packages/ui/src/tokens/`의 CSS 변수(`--ui-*`)로 정의, 앱은 변수만 사용.

### 2. TopBar

- 좌: 사이드바 접기 토글(햄버거) + `Galley`. (워크스페이스 탭 제거 — decisions/navigation.md.)
- 우: 상태 칩 1개(단색 pill) — 현재 모델명 + ▾(모델 전환). Phase 1은 모델명만, 비용은 Phase 2.
- 앱에서 유일한 다크 영역.

### 3. Sidebar (사용 흐름 순 — decisions/navigation.md)

```
주제  : 큐 /queue (배지 대기 n)
실행  : 실행 /runs (배지 승인 대기 n·주황) · 이력 /runs/history (Phase 2)
발행  : 발행 대기 /publish (배지 미발행 n, Phase 2)
설정  : 리포 연결 /settings/repos · 모델·비용 /settings/model · 어투 프롬프트 /settings/prompts (Phase 2)
─────
외부  : Zenn 열기 · velog 열기
개발  : 컴포넌트 갤러리 /design (dev 서버 전용)
```

- 위→아래 = 글 하나의 생애주기 = 사용 빈도. 상태(대기/후보/보류/완료·진행중/완료 등)는 **메뉴가 아니라 화면 안 탭(?tab=)**.
- 활성: 텍스트+아이콘 블루, 연한 블루 틴트 배경. **활성 판정은 URL(pathname)**.
- 접힘: 아이콘만 + 라벨 Tooltip(Base UI). 접힘 저장은 localStorage(→ sidebar-collapse-persistence).
- Phase 1 구현 화면 = 큐 /queue + 실행 /runs. 이력·발행·설정은 메뉴에 두되 "Phase 2" 빈 페이지.
- 구 경로(/queue/candidates·/queue/done·/runs/active·/publish/zenn·/publish/velog)는 새 경로로 redirect.

### 4. Content 패턴 두 가지만

- **A. 목록형**(큐/후보/완료/실행 이력): 제목 → 흰 카드 → 상단 툴바(검색·필터 탭·체크박스) → 행 목록(제목 + 보조 텍스트 + 우측 상태 배지·시간). 큐만 DnD.
- **B. 2분할 상세**(실행 상세): 좌 320px(검색 → 탭 실행중/완료 → 체크박스 "승인 대기만" → 항목 목록) / 우(헤더 주제명+⋮ → 단계 타임라인 → 하단 고정 바). 한 카드 안 분할.
  - 타임라인 한 줄 = 단계명 + 상태 아이콘 + 소요 시간 + 토큰 + "diff 보기". 단계 순서 고정(6단계): 근거 수집 → 벨로그 본문 → **근거 검증** → 링크드인 → Zenn → 발행정보·썸네일 (decisions/evidence-collection.md).
  - 하단 바 = "지시 1회 → 해당 단계 재실행" (채팅 아님).

설정 화면은 "목록형(A) 카드 안의 폼 섹션"으로 정의한다. 홈 화면은 "목록형(A)의 변형 **요약형**"으로 정의한다(아래 화면별 적용). **셋째 패턴을 만들지 않는다.**

#### 화면별 적용 (IA는 decisions/navigation.md)

**홈 / — 목록형(A)의 변형 "요약형" · Phase 1(분할 구현)**

- 새 패턴 아님. 목록형(A)에서 툴바(검색·필터)를 빼고 **"제목 → 카드 여러 개를 grid 배치, 각 카드 안은 ListRow 목록"**으로 변형. 최대 폭 1200px, 카드 간격은 tokens spacing만, 차트 없음.
- h1 "홈". 우측 보조 텍스트: 다음 스케줄 실행 시각("다음 자동 실행: 수 18:00" — 수·토 18:00 중 가까운 쪽). TZ는 .env/설정값(하드코딩 금지), **계산은 apps/dashboard 유틸**(pipeline은 스케줄을 소유하지 않음, 표시 전용).
- **행 1 — StatTile 4개**(같은 폭): 대기 n→/queue?tab=waiting · 승인 대기 n(주황)→/runs?filter=approval · 발행 대기 n→/publish · 이번 달 비용(Phase 2, "—"). 타일=라벨(13px 회색)+숫자(24~28px)+우하단 화살표. 0이면 회색, **승인 대기만 ≥1일 때 주황 텍스트**. 색 블록·배경색 금지. 클릭→해당 화면.
- **행 2 (좌 60% / 우 40%)**: "지금 할 일"(승인 대기 실행 목록, 행=주제·마지막 완료 단계·대기 시작 시간·상태 배지 옆 작은 텍스트 "근거 없음 n"(unsupported ≥ 1일 때만)·우측 `검수`→/runs?id=, 최대 5, 초과 시 "n개 더 보기→/runs", 빈 상태 "검수할 초안이 없습니다.") / "다음 실행"(대기 맨 위 1개 크게=제목·카테고리·근거 리포 + `지금 실행`(주요 블루)·`큐 편집`(→/queue), 아래 대기 2~4위 작은 행 최대 3, 빈 상태 "대기 중인 주제가 없습니다. 후보에서 골라 주세요."+`후보 보기`→/queue?tab=candidates).
- **행 3 (좌우 동일)**: "최근 실행"(최근 5, 행=주제·결과 배지(완료/실패/승인 대기)·모델·시간, 클릭→/runs?id=, 헤더 우측 "이력 전체 →"/runs/history) / "발행 대기"(승인됐지만 채널 3 중 미발행, 행=제목·velog·Zenn·LinkedIn 미니 상태, 클릭→/publish, 최대 5, Phase 2 데이터 없으면 카드는 두되 빈 상태).
- 데이터: 전부 서버 컴포넌트 직접 조회(**배지 카운트와 같은 소스** → 타일·배지 불일치 방지). 홈 전용 API 없음. 갱신 = 서버 렌더 + 네비게이션 시 재조회(배지와 동일).
- **구현 분할**: 뼈대·타일·"다음 실행"(A4d 큐 데이터)은 Phase 1 지금. "지금 할 일"·"최근 실행"은 B1e(Run 스키마), "발행 대기"는 Phase 2 — 그 전까지 영구 빈 상태.

**큐 /queue — 목록형(A)**

- h1 "주제". 우측 `주제 추가`(보조) + `맨 위 실행`(주요, 블루) + `파일에서 다시 불러오기`(보조, 결과 한 줄 표시 — decisions/queue-sync-direction.md 수동 갱신 버튼).
- 툴바: 탭(대기 n / 후보 n / 보류 / 완료) · 검색 · 카테고리 필터. 카테고리 = 주제_큐.md 후보 섹션 `###` 소제목. 탭 4개 = md 섹션 4개 1:1.
- 행 = 제목 · 보조(카테고리 · 근거 리포 · **근거 n건**) · 우측 상태 배지 · ⋮(대기로 / 후보로 / 보류로 / **근거 편집** / 지금 실행). "근거 편집" = 연결된 분석 글 목록 보기·추가·제거 Dialog(리포 인덱스 검색 포함).
- 대기 탭만 DnD, 맨 위 행에 "다음 실행" 표시. 완료 탭 행 = 제목 · 완료일 · 실행 상세 링크(/runs?id=).
- 활성 탭 = URL 쿼리(?tab=). 로컬 상태 금지.

**실행 /runs — 2분할 상세형(B)**

- 좌 320px: 검색 → 탭(진행 중 / 완료) → 체크박스 "승인 대기만 보기" → 항목 목록(6단계 원형 진행 인디케이터 · 주제명 · 마지막 단계 미리보기 · 상태 배지 옆 작은 텍스트 "근거 없음 n" · 시간, 선택=?id=).
- 우: 헤더(주제명 + 상태 배지 + ⋮: 중단 / 처음부터 재실행 / 산출물 폴더 경로 복사) → 타임라인 6줄 → 하단 고정 ActionBar.
  - 타임라인 한 줄 = 단계명 · 상태 아이콘 · 소요 · 토큰 · `보기`(첫 실행) / `diff`(재실행 후). 펼치면 그 단계 산출물 마크다운 렌더(검수는 읽어야 하므로 필수).
  - **결과 출처 표기(`fresh` / `carried`)**: 이번 재실행에서 다시 돈 단계(`fresh`)는 평소 표기 그대로. 시작 단계보다 앞이라 이번 범위에 없던 단계(`carried`)는 **연한 회색 체크 + 보조 텍스트 "이전 결과 · {원래 실행 시각}"**. **"건너뜀"이라는 문구는 쓰지 않는다** — 누락처럼 읽히지만 실제로는 유효한 이전 결과다. 첫 실행은 전부 `fresh`라 이 표기가 없다. (evidence-collection 요구사항 3)
  - **근거 수집 줄**: 보조 텍스트 "linked n · discovered n". 펼치면 EvidenceBundle 항목 목록(경로 · 커밋 · 조각 미리보기).
  - **근거 검증 줄**: 배지 "근거 없음 n · 불확실 n"(unsupported ≥ 1이면 주황). 펼치면 주장 목록 + 상태 + 근거 링크. 본문 미리보기의 unsupported 밑줄은 Phase 2(evidence-collection).
  - ActionBar = 단계 Select + 수정 지시 input + `재실행`(보조) / `승인`(주요, Dialog 확인). 재실행 규칙은 **"시작 단계 + 이후 전부"**(evidence-collection) — Select 지정이 우선, 없으면 지시에 "근거·커밋·코드"가 있으면 근거 수집부터, 없으면 본문부터.
  - **재실행 확인 Dialog**: 비용이 커지므로 실행 전에 다시 돌 단계를 보여준다 — "다시 도는 단계: 근거 수집 → 본문 → 검증 → 링크드인 → Zenn → 발행정보". 승인 Dialog와 같은 확인 패턴.
- 빈 상태: 실행 없으면 "큐에서 실행" 안내 + /queue 링크.

**이력 /runs/history — 목록형 표(A) · Phase 2**

- 컬럼: 날짜 · 주제 · 모델 · 토큰 · 비용 · 결과 배지. 행 클릭 → /runs?id=. 읽기 전용.

**발행 대기 /publish — 목록형(A) · Phase 2**

- 행 = 글 제목 · 승인일 · 우측 채널 3개 미니 상태(velog · Zenn · LinkedIn).
- 펼침: velog `본문 복사` + 발행 체크(수동) / Zenn `下書き push` → 푸시됨 배지 / LinkedIn `요약 복사` + 체크.
- 3개 모두 체크 → 큐 "완료"로 자동 이동 + 주제_큐.md 반영. 공개 발행 API 호출 금지(publish-gate).

**설정 /settings/\* — 목록형 카드 안 폼 섹션(A 변형) · Phase 2**

- 리포 연결(/settings/repos): 행 = 이름 · 경로 · `읽기 전용` 배지 · 상태 배지(ready/stale/indexing) · 분석 글 n · 마지막 인덱싱 · 인덱싱 모델 label · `재인덱싱` · 제거. 상단 `폴더 추가`. 폴더 추가·재인덱싱은 Dialog(실행 Dialog와 같은 모델 Select, 기본 Haiku 4.5). 인덱싱 중이면 진행률(디렉터리 n/m). Phase 1-B는 CLI `index <path>`가 같은 일을 한다(evidence-collection).
- 모델·비용: 어댑터 Select + 이번 달/월별 비용 표(TopBar 칩과 같은 소스).
- 어투 프롬프트: 탭(벨로그 / 링크드인 / Zenn) + 텍스트 에디터 + `저장`(파일 그대로 편집).

### 5. 상태 배지 색 (도메인↔variant 매핑은 apps/dashboard 어댑터. ui는 variant 이름만)

후보 회색 / 보류 회색 / 대기 블루 / 실행 중 블루+펄스 / 승인 대기 주황 / 완료 초록 / 실패 빨강. 배지는 작게 텍스트 옆.

### 6. 안 가져오는 것

그라데이션 칩 → 단색 pill. 이모지 → lucide. 채팅 말풍선 → 타임라인.

### 7. 구현 매핑

- `app/(dashboard)/layout.tsx` 하나에 TopBar·Sidebar 고정. 루트 `/`는 `app/(dashboard)/page.tsx` = 홈(요약형). redirect 아님(2026-09-09 결정 변경 — decisions/navigation.md).
- `@galley/ui`(도메인 단어 없음): components/ Button·Badge·Card·PageHeader / patterns/ AppShell·SidebarGroup·SidebarItem·TopBarChip·ListToolbar·ListRow·SplitPane·TimelineItem·ActionBar / primitives/ Tabs·Menu·Checkbox·Tooltip·Dialog·Select(+ 내부 공통 ItemContent, 배럴 비노출).
- `apps/dashboard`: 라우트, 사이드바 메뉴 정의(라벨·경로·아이콘 배열 1개), 상태→Badge variant 매핑, 데이터 페칭.

## 기각된 대안

- 새 Content 패턴 추가: 일관성 훼손. A/B 둘만.
- ui에 도메인 반영: ui-package-boundary 위반.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정(스펙 요약본 반영).
- 2026-09-08 IA 재정비: 사이드바를 사용 흐름 순으로 재구성(§3), TopBar 워크스페이스 탭 제거(§2), 화면별 레이아웃 추가(§4). decisions/navigation.md 신설. 사용자 프롬프트가 §3 고정 결정 변경 승인.
- 2026-09-09 홈 화면 추가: 목록형(A)의 변형 **"요약형"**(§4 화면별 적용). 루트 `/`=홈으로 결정 변경(decisions/navigation.md 갱신 이력)에 따라 §7 구현 매핑도 redirect→홈으로 갱신. 셋째 패턴은 만들지 않음(요약형은 A 변형).
- 2026-09-12 재실행 규칙 교체(decisions/evidence-collection.md 갱신 이력): 타임라인에 결과 출처 표기 추가(`carried` = 연한 회색 체크 + "이전 결과 · 시각", "건너뜀" 문구 금지) · ActionBar 재실행을 "시작 단계 + 이후 전부"로 · 재실행 확인 Dialog(다시 도는 단계 목록)를 실행 전에.
- 2026-09-09 근거 수집 구조(decisions/evidence-collection.md): 타임라인 단계 5→**6**(근거 검증을 본문 직후에 추가). 실행 상세에 근거 수집·검증 줄 펼침 표시, 좌 목록·홈 "지금 할 일"에 "근거 없음 n", 큐 행에 "근거 n건"·⋮ "근거 편집", 설정 리포 연결 행 확장. 패턴 추가 없음.
- 2026-09-10 **셸 스크롤 구조 확정**(사용자 스펙, PR #41): AppShell 루트 = `100dvh` 두 행 grid(`--ui-topbar-height` / 1fr, overflow hidden), 두 번째 행 = `--ui-sidebar-width` | 1fr(min-height 0). **TopBar·Sidebar 고정, 스크롤은 Content(·Sidebar 자체) 안에서만** — html/body는 `height 100%; overflow hidden`으로 문서 스크롤 없음. 패딩은 Content 안쪽 래퍼(스크롤바는 Content 우측 끝). 접힘은 열 폭만 변경.
- 2026-09-10 **Select 규칙 확정**(사용자 스펙, PR #41): 팝업 `width: max-content; min-width: var(--anchor-width)`, 상한 토큰 `--ui-select-popup-max-width`(min(480px, 100vw−32)) · `--ui-select-popup-max-height`(min(360px, 100vh−32)) + 세로 스크롤(열릴 때 선택 항목 보임). **트리거 폭은 부모가 정한다**(width 100%·min-width 0, 값 nowrap+ellipsis) — 앱은 컨테이너로 폭 지정. 아이템 레이아웃은 공통 **`ItemContent`**({ label, description?, meta? }: 본문 열 라벨 line-clamp 2 + overflow-wrap anywhere / 보조 한 줄 ellipsis / 우측 메타 tabular-nums)로 Select·Menu(UM2)가 공유. Menu는 Phase 1 큐 ⋮(AN5) 직전에 만든다.
- 2026-09-10 셸 스크롤·Select 규칙의 자동 검증은 실측 스크립트 `pnpm --filter dashboard verify:layout`(decisions/layout-measurement.md). 레이아웃 컴포넌트·갤러리를 바꾸는 항목의 완료 조건.
- 2026-09-11 §5에 **보류 회색** 추가(A5b 구현 중 발견한 누락 — 큐 상태 4개 중 보류만 색이 없었음). 사용자 결정 `neutral`: 후보와 같이 "진행하지 않는 주제", 주황은 승인 대기 전용으로 남긴다. 기각: 주황(승인 대기와 신호 겹침)·빨강(실패와 겹침, 과함).
- 2026-09-12 **Menu 규칙 확정**(UM2, 에이전트 기본값을 사용자가 그대로 확정): 데이터형 API — `items`(항목 id·label·description?·meta?·disabled?·disabledReason? | `{ type: 'separator' }`) · `onSelect(id)`(고르면 닫힘) · `trigger`(요소, props·ref를 DOM 버튼까지 넘겨야 함 — 래퍼 컴포넌트 금지) · `align` 기본 `end`(행 끝 ⋮) · open 비제어. 아이템은 Select와 같은 `ItemContent`. 팝업 `width: max-content; min-width: max(var(--anchor-width), --ui-menu-popup-min-width)`, 상한 `--ui-menu-popup-max-width`, 높이는 `--available-height` 안 스크롤. 토큰 `--ui-menu-popup-min-width` **160px** · `--ui-menu-popup-max-width` **min(320px, 100vw−32)** — Select(480)보다 좁게: 액션 메뉴는 짧은 동사 라벨, ⋮ 트리거가 작아 최소 폭 필요. 자동 검증은 verify:layout `menu.mjs`.
- 2026-09-12 **StatTile·EmptyState 규칙 확정**(AH1, 에이전트 기본값을 사용자가 그대로 확정): 값 색 톤 `default|muted|warning` — `muted`는 §4 "0이면 회색"을 **앱이 지정**하게 하려고 추가(ui는 그 값이 0인지, 숫자인지조차 모른다. 값이 "—"일 수도 있어 ui가 판단하면 규칙이 지저분해진다). 숫자 크기 토큰 `--ui-text-stat` **26px**(§4 24~28px인데 기존 최대가 `--ui-text-title` 22px, 하드코딩 금지라 신설). **`CardGrid`는 만들지 않음** — 타일 4개 배치는 앱 CSS grid(`repeat(4, minmax(0,1fr))` + gap 토큰)로 충분(갤러리에서 확인), 재사용이 반복되면 그때 추출. 링크는 `href` 또는 `render`(SidebarItem과 같은 방식, ui는 next 미의존). `EmptyState`는 한 줄 메시지 + 선택 액션 슬롯.
- 2026-09-12 §4 큐 헤더에 `파일에서 다시 불러오기`(보조) 추가 — 사용자 결정(queue-sync-direction 수동 갱신 버튼). TopBar 전역 버튼안은 기각(§2 유지).
