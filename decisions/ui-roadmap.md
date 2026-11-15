# galley-ui 고도화 로드맵 — 닫고 개별 항목만 남긴다 (P7l 재계획)

## 결정

- 2026-09-21 초안의 **Q1~Q4 → 1.0 로드맵을 닫는다.** 미착수 컴포넌트·패턴(DescriptionList·Drawer·Progress/Stepper·FilterBar/DataToolbar·KPI 그리드·Command palette·DateRangePicker·Combobox·NumberField·밀도 모드·accent 테마 API·기본 라벨 i18n)은 todo에서 뺀다.
- 새 컴포넌트는 **Galley 화면에 실제 자리가 생긴 시점**에 그 화면 작업의 일부로 올린다(예: Phase 2 리포 연결 화면이 인덱싱 진행을 보여야 하면 그때 Progress). 라이브러리 구색을 위해 먼저 만들지 않는다.
- 남기는 ui 항목은 개별 todo로만: **P7h**(VoiceOver 폼 오류 낭독 실측, 사용자) · **P7i**(Dialog 안 Popover 실측) · **P7j**(InlineAlert `live` 탈출구) · **P7f**(npm 링크 반영) · **P7k 1.0 전 재검토 묶음**(RF-33·RF-11·RF-31·RF-10).
- **1.0(API 동결)은 MVP 리허설(MR1~MR3) 뒤 별도 `/decide`.** 리허설이 실제 리포·실제 모델로 화면을 끝까지 쓰는 첫 기회라 ui API 빈틈이 더 나올 수 있다(P7d-apply에서 Table numeric nowrap이 그렇게 나왔다).
- DescriptionList는 조건 메모로만 둔다: 지금 자리는 실행 상세 RunActionBar의 재실행 계획 `<dl>` 3줄 한 곳. **자리가 2곳 이상 되면** 항목으로 올린다.

## 이유

- 초안 작성 뒤 두 달 동안 Q1 전부(P7b·P7c·P7k 1·2차)와 Q2의 Table·Pagination·Breadcrumb·Avatar, Q4의 P7g가 끝났다. 남은 것을 2026-11-15에 화면 기준으로 대조하면 자리가 있는 항목이 DescriptionList 한 곳뿐이다.
  - Drawer: 큐 근거 편집은 Dialog, 상세는 SplitPane으로 결정됨(decisions/layout.md). Progress/Stepper: 단계 흐름은 TimelineItem, 인덱싱 진행은 Phase 2 화면이 아직 Placeholder.
  - FilterBar: ListToolbar가 있고 이력 표 필터 수요 없음. KPI 그리드: 홈에서 "ui에 CardGrid를 두지 않는다"로 결정(앱 grid). Command palette·DateRangePicker·Combobox·NumberField: 대시보드에 숫자·날짜 입력이 0곳.
  - 밀도 모드: Table `density`로 국소 해결, 전역 밀도 자리 없음. accent 테마 API: "포인트 색 블루 1개"(CLAUDE.md)와 충돌. 기본 라벨 i18n: 라벨은 전부 prop(Pagination `labels` 등)이고 소스에 남은 한국어는 개발용 경고 문구 하나(`internal/accessibleName`).
- 초안 자체가 "각 항목은 Galley 화면의 실제 자리가 있을 때만"을 조건으로 달았다. 조건을 적용한 결과가 곧 이 결정이다.
- 작업 리듬(현장 투입 뒤 세션당 단위 하나, 리허설 버그 우선)에 분기별 로드맵은 맞지 않는다. 자리가 생길 때 올리는 쪽이 todo를 정직하게 유지한다.

## 기각된 대안

- **B. 자리 있는 것만 남긴 축소 로드맵(DescriptionList 정식 항목 → P7h·P7i·P7j → 1.0 고정)** — `<dl>` 3줄 때문에 컴포넌트를 만들고 배포(minor)하는 비용이 크다. 다음 ui 단위가 바로 정해지는 장점은 있지만 자리 2곳 조건으로 충분하다.
- **C. 원안 유지, 자리 조건 완화(오픈소스 성장 목표로 Q3·Q4 진행)** — INTENT의 "사람이 검수하는 초안 파이프라인"에서 멀어지고, 현장 투입 뒤 시간에 맞지 않는다. 오픈소스 확장은 Galley가 MVP를 지난 뒤 다시 볼 수 있다(결정 변경이 아니라 그때 새 결정).

## 배포 시 변화

- 없음(문서 결정). galley-ui 0.4.0이 현재 최신이고 changeset 폴더는 비어 있다.

## 결정일

2026-11-15 (사용자 "추천대로 A로 가자", P7l — 2026-09-21 논의 초안을 "사용자 결정으로 본체 복귀"하며 보류한 것의 재계획)

## 갱신 이력

- 2026-11-15 최초 결정.
