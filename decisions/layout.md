# 대시보드 레이아웃 스펙

원본: `~/Desktop/projects/대시보드_레이아웃_스펙.md`. **충돌 시 스펙 파일이 우선한다.** 전 직장 콘솔의 정보 구조만 참고(클린룸, 코드 미열람).

## 결정

아래 골격·패턴을 고정한다. 새 Content 패턴을 만들지 않는다.

### 1. 전체 골격

- TopBar(다크 #1F2126, 48px, 전체 폭) 고정 → 아래 Sidebar(흰 220~240px) + Content(#F5F6F8).
- 데스크톱 전용(min-width 1200), 라이트 테마만(다크는 토큰 자리만). 배경 #F5F6F8, 카드 흰색 라운드 8~~12, 본문 13~~14px, 제목 20~22px.
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
  - 타임라인 한 줄 = 단계명 + 상태 아이콘 + 소요 시간 + 토큰 + "diff 보기". 단계 순서 고정: 근거 수집 → 벨로그 본문 → 링크드인 → Zenn → 발행정보·썸네일.
  - 하단 바 = "지시 1회 → 해당 단계 재실행" (채팅 아님).

설정 화면은 "목록형(A) 카드 안의 폼 섹션"으로 정의한다. 셋째 패턴을 만들지 않는다.

#### 화면별 적용 (IA는 decisions/navigation.md)

**큐 /queue — 목록형(A)**

- h1 "주제". 우측 `주제 추가`(보조) + `맨 위 실행`(주요, 블루).
- 툴바: 탭(대기 n / 후보 n / 보류 / 완료) · 검색 · 카테고리 필터. 카테고리 = 주제_큐.md 후보 섹션 `###` 소제목. 탭 4개 = md 섹션 4개 1:1.
- 행 = 제목 · 보조(카테고리 · 근거 리포) · 우측 상태 배지 · ⋮(대기로 / 후보로 / 보류로 / 지금 실행).
- 대기 탭만 DnD, 맨 위 행에 "다음 실행" 표시. 완료 탭 행 = 제목 · 완료일 · 실행 상세 링크(/runs?id=).
- 활성 탭 = URL 쿼리(?tab=). 로컬 상태 금지.

**실행 /runs — 2분할 상세형(B)**

- 좌 320px: 검색 → 탭(진행 중 / 완료) → 체크박스 "승인 대기만 보기" → 항목 목록(5단계 원형 진행 인디케이터 · 주제명 · 마지막 단계 미리보기 · 시간, 선택=?id=).
- 우: 헤더(주제명 + 상태 배지 + ⋮: 중단 / 처음부터 재실행 / 산출물 폴더 경로 복사) → 타임라인 5줄 → 하단 고정 ActionBar.
  - 타임라인 한 줄 = 단계명 · 상태 아이콘 · 소요 · 토큰 · `보기`(첫 실행) / `diff`(재실행 후). 펼치면 그 단계 산출물 마크다운 렌더(검수는 읽어야 하므로 필수).
  - ActionBar = 단계 Select + 수정 지시 input + `재실행`(보조) / `승인`(주요, Dialog 확인).
- 빈 상태: 실행 없으면 "큐에서 실행" 안내 + /queue 링크.

**이력 /runs/history — 목록형 표(A) · Phase 2**

- 컬럼: 날짜 · 주제 · 모델 · 토큰 · 비용 · 결과 배지. 행 클릭 → /runs?id=. 읽기 전용.

**발행 대기 /publish — 목록형(A) · Phase 2**

- 행 = 글 제목 · 승인일 · 우측 채널 3개 미니 상태(velog · Zenn · LinkedIn).
- 펼침: velog `본문 복사` + 발행 체크(수동) / Zenn `下書き push` → 푸시됨 배지 / LinkedIn `요약 복사` + 체크.
- 3개 모두 체크 → 큐 "완료"로 자동 이동 + 주제_큐.md 반영. 공개 발행 API 호출 금지(publish-gate).

**설정 /settings/\* — 목록형 카드 안 폼 섹션(A 변형) · Phase 2**

- 리포 연결: 행 = 경로 + `읽기 전용` 배지 + 제거. 상단 `폴더 추가`.
- 모델·비용: 어댑터 Select + 이번 달/월별 비용 표(TopBar 칩과 같은 소스).
- 어투 프롬프트: 탭(벨로그 / 링크드인 / Zenn) + 텍스트 에디터 + `저장`(파일 그대로 편집).

### 5. 상태 배지 색 (도메인↔variant 매핑은 apps/dashboard 어댑터. ui는 variant 이름만)

후보 회색 / 대기 블루 / 실행 중 블루+펄스 / 승인 대기 주황 / 완료 초록 / 실패 빨강. 배지는 작게 텍스트 옆.

### 6. 안 가져오는 것

그라데이션 칩 → 단색 pill. 이모지 → lucide. 채팅 말풍선 → 타임라인.

### 7. 구현 매핑

- `app/(dashboard)/layout.tsx` 하나에 TopBar·Sidebar 고정. 루트 `page.tsx`는 `/queue` redirect.
- `@galley/ui`(도메인 단어 없음): components/ Button·Badge·Card·PageHeader / patterns/ AppShell·SidebarGroup·SidebarItem·TopBarChip·ListToolbar·ListRow·SplitPane·TimelineItem·ActionBar / primitives/ Tabs·Menu·Checkbox·Tooltip·Dialog·Select.
- `apps/dashboard`: 라우트, 사이드바 메뉴 정의(라벨·경로·아이콘 배열 1개), 상태→Badge variant 매핑, 데이터 페칭.

## 기각된 대안

- 새 Content 패턴 추가: 일관성 훼손. A/B 둘만.
- ui에 도메인 반영: ui-package-boundary 위반.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정(스펙 요약본 반영).
- 2026-09-08 IA 재정비: 사이드바를 사용 흐름 순으로 재구성(§3), TopBar 워크스페이스 탭 제거(§2), 화면별 레이아웃 추가(§4). decisions/navigation.md 신설. 사용자 프롬프트가 §3 고정 결정 변경 승인.
