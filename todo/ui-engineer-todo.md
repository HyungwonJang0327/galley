# ui-engineer todo

상세·상태는 [mvp-todo.md](./mvp-todo.md). 여기는 내 담당 ID 목록. `galley-ui`만. 도메인 단어 금지, 토큰 변수만.

## Phase 1-A

- A1 — 디자인 토큰(색·간격·타이포·라운드·그림자 → `--ui-*`)
- A2a Button · A2b Badge · A2c Card · A2d PageHeader (각 폴더+테스트+스토리)
- A3a — AppShell·SidebarGroup·SidebarItem·TopBarChip 패턴(표현 전용, `isActive` prop)
- A5a — ListToolbar·ListRow 패턴 (큐 탭 화면 AN4가 소비)
- UM2 — Menu 프리미티브(Base UI 래퍼, Select와 ItemContent 공유). 큐 행 ⋮(AN5)가 소비. 갤러리 섹션 + `verify:layout` 포함.
- AH1 — StatTile(label·value·href·tone default|warning·icon 슬롯) · EmptyState(메시지+선택 액션 버튼). 테스트·스토리. CardGrid는 기존 Card 조합으로 충분하면 생략하고 이유 보고. (홈 요약형이 소비)

## Phase 1-B

- B2a — SplitPane·TimelineItem·ActionBar 패턴
- UM3 — Input 프리미티브(2026-09-14 완료, B2c 리뷰에서 파생).
- UM4 — Textarea·Checkbox·Tooltip·Tabs 프리미티브 + 갤러리 맨 폼 요소 교체(2026-09-14 완료). 스펙 primitives 중 남은 것: Popover.
- UM1 — Dialog·Select 프리미티브(Base UI 래퍼, 도메인 무지). 실행 시작 Dialog(BM6)·재실행 모델 Select(BM8)·TopBar 기본 모델 Select(BM9)가 소비. (Dialog는 core-modules에서 핵심 모듈 제외 → ui가 구현)

각 작업: index 배럴 export · 토큰만 참조 · `X.test.tsx` · `pnpm --filter galley-ui build && test` 통과.

## Phase P — galley-ui 0.1.0 npm 배포 (2026-09-15 추가, B·BM·BE·BS보다 우선 — decisions/package-name.md)

항목 하나 = 브랜치 하나 = PR 하나. 각 컴포넌트: 폴더 5파일 + 배럴 export(타입 포함) + `/design` 갤러리 섹션 + `pnpm --filter galley-ui build && test` + `verify:layout` + reviewer 리뷰 통과. Base UI API는 설치본 타입으로 확인.

- P1a — 패키지명 옛 `@galley` 스코프명 → `galley-ui` 코드·설정 치환 + lock 재생성 (`chore/ui-rename`)
- P2a · P2b — 배포 메타데이터·LICENSE · d.ts에서 스토리·테스트 제외 (`chore/ui-publish-meta`)
- P3a · P3b — 다크 색 토큰 25개(대비표) · 갤러리 개발용 테마 토글 (`design/ui-dark-tokens`)
- P4-1 Separator · P4-2 Switch · P4-3 RadioGroup · P4-4 FormField · P4-5 Popover(비제어 허용 유일 예외) · P4-6 InlineAlert(TD2 ui 부분) · P4-7 Skeleton · P4-8 Toast+useToast — 순서대로
- ~~P4-9 useAwaitDialog·useConfirm~~ — 완료(2026-09-21, feat/ui-await-dialog, todo/mvp-todo.md P4-9). 테스트 5종 + 바깥 클릭·포커스 복귀·세션 상태 초기화·언마운트 뒤 open 포함
- P4-10 — 9개 끝나면 아래 UM4 줄의 "남은 것: Popover" 정리
- RF3 — 배포 전 리팩토링(사용자 승인 항목만, 항목당 커밋, 동작·시각 변화 없음). P4-11 뒤·P5 앞
- P6b · P6c — changeset 추가 · version 반영. publish는 사용자 확인 후에만
