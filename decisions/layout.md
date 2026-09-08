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

- 좌: 사이드바 접기 토글(햄버거) + `Galley` + 워크스페이스 탭 pill 2개(`글`/`설정`, 활성=블루).
- 우: 상태 칩 1개(단색 pill) — 현재 모델명 + ▾(모델 전환). Phase 1은 모델명만, 비용은 Phase 2.
- 앱에서 유일한 다크 영역.

### 3. Sidebar (그룹 → 항목(라벨+우측 배지) → 구분선 → 외부 링크)

```
주제  : 큐 /queue (배지 대기 n) · 후보 /queue/candidates · 완료 /queue/done
실행  : 실행 이력 /runs · 진행 중 /runs/active (실행 중 배지)
발행  : Zenn 下書き /publish/zenn · 벨로그 대기 /publish/velog
설정  : 리포 연결 /settings/repos · 모델·비용 /settings/model · 어투 프롬프트 /settings/prompts
외부  : Zenn 열기 · velog 열기
```

- 활성: 텍스트+아이콘 블루, 연한 블루 틴트 배경. **활성 판정은 URL(pathname)**.
- 접힘: 아이콘만 + 라벨 Tooltip(Base UI). 접힘 저장은 localStorage(→ sidebar-collapse-persistence).
- Phase 1 구현 화면 = 주제 3 + 실행 2. 나머지는 메뉴에 두되 "Phase 2" 빈 페이지.

### 4. Content 패턴 두 가지만

- **A. 목록형**(큐/후보/완료/실행 이력): 제목 → 흰 카드 → 상단 툴바(검색·필터 탭·체크박스) → 행 목록(제목 + 보조 텍스트 + 우측 상태 배지·시간). 큐만 DnD.
- **B. 2분할 상세**(실행 상세): 좌 320px(검색 → 탭 실행중/완료 → 체크박스 "승인 대기만" → 항목 목록) / 우(헤더 주제명+⋮ → 단계 타임라인 → 하단 고정 바). 한 카드 안 분할.
  - 타임라인 한 줄 = 단계명 + 상태 아이콘 + 소요 시간 + 토큰 + "diff 보기". 단계 순서 고정: 근거 수집 → 벨로그 본문 → 링크드인 → Zenn → 발행정보·썸네일.
  - 하단 바 = "지시 1회 → 해당 단계 재실행" (채팅 아님).

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
