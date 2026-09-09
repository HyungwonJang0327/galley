# ui-engineer todo

상세·상태는 [mvp-todo.md](./mvp-todo.md). 여기는 내 담당 ID 목록. `@galley/ui`만. 도메인 단어 금지, 토큰 변수만.

## Phase 1-A

- A1 — 디자인 토큰(색·간격·타이포·라운드·그림자 → `--ui-*`)
- A2a Button · A2b Badge · A2c Card · A2d PageHeader (각 폴더+테스트+스토리)
- A3a — AppShell·SidebarGroup·SidebarItem·TopBarChip 패턴(표현 전용, `isActive` prop)
- A5a — ListToolbar·ListRow 패턴 (큐 탭 화면 AN4가 소비)
- AH1 — StatTile(label·value·href·tone default|warning·icon 슬롯) · EmptyState(메시지+선택 액션 버튼). 테스트·스토리. CardGrid는 기존 Card 조합으로 충분하면 생략하고 이유 보고. (홈 요약형이 소비)

## Phase 1-B

- B2a — SplitPane·TimelineItem·ActionBar 패턴
- UM1 — Dialog·Select 프리미티브(Base UI 래퍼, 도메인 무지). 실행 시작 Dialog(BM6)·재실행 모델 Select(BM8)·TopBar 기본 모델 Select(BM9)가 소비. (Dialog는 core-modules에서 핵심 모듈 제외 → ui가 구현)

각 작업: index 배럴 export · 토큰만 참조 · `X.test.tsx` · `pnpm --filter @galley/ui build && test` 통과.
