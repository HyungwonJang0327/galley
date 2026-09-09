# 레이아웃 실측 스크립트 (headless Chrome CDP)

## 결정

AppShell 스크롤 구조·Select 팝업을 검증한 CDP 실측 스크립트를 리포에 둔다.

- 위치: `apps/dashboard/scripts/verify-layout/` — `run.mjs`(진입점) · `cdp.mjs`(Chrome 실행·CDP 연결 공통) · `shell-scroll.mjs` · `select.mjs`(검사 모듈). 실행: `pnpm --filter dashboard verify:layout`.
- 동작: 프로덕션 빌드(`next build`) → `next start` → `/design`을 headless Chrome으로 열어 실측 → PASS/FAIL 목록 + 종료 코드. `--no-build`(기존 `.next` 재사용) · `--url <base>`(떠 있는 서버 사용) · `--out <dir>`(스크린샷) 옵션.
- **수동 실행, CI 미포함(2026-09-10 시점).** CI 통합은 **로컬에서 10회 연속 통과를 확인한 뒤 별도 결정**으로 한다(플래키 여부가 먼저).
- **완료 조건 규칙**: 레이아웃 컴포넌트(AppShell·Sidebar·TopBar·ListRow·ListToolbar 등 `packages/ui` patterns)를 건드리는 todo 항목과, 갤러리(`/design`)를 바꾸는 항목의 완료 조건에 "`pnpm --filter dashboard verify:layout` 통과"를 넣는다. 스크립트가 갤러리의 `aria-label`·구조에 결합되어 있으므로 갤러리를 바꾸면 스크립트도 같이 맞춘다.
- 규칙 준수
  - Chrome 실행 파일은 `GALLEY_CHROME` 환경 변수 우선, 없으면 OS별 기본 후보(macOS 앱 경로 / Linux `google-chrome`·`chromium` PATH / Windows Program Files)를 탐색한다. macOS 절대경로 하드코딩 없음.
  - 기대값(TopBar 높이·사이드바 폭·접힘 폭·팝업 상한)은 페이지의 `--ui-*` 토큰과 computed style에서 읽는다. 숫자를 스크립트에 하드코딩하지 않는다.
  - CDP 포트는 `--remote-debugging-port=0` + `DevToolsActivePort` 파일로 받아 충돌이 없다. Node 20은 `--experimental-websocket`이 필요해 package.json 스크립트에 넣는다(Node 22+는 무시).
  - `next start` 자식 프로세스는 프로세스 그룹으로 정리한다(POSIX). 임시 프로필 디렉터리는 삭제.

## 이유

- happy-dom은 레이아웃을 계산하지 않아 CSS 폭·높이·스크롤·뒤집힘은 단위 테스트로 RED가 나오지 않는다. 2026-09-10 AppShell·Select 수정에서 이 스크립트가 유일한 자동 검증이었고, 수정 전 상태에서 FAIL 4건(팝업 폭 568>480·높이 557>360·트리거 378>200·ellipsis 없음)을 잡았다.
- 세션 스크래치패드에만 있으면 세션이 끝날 때 사라진다. 다음 레이아웃 작업마다 다시 쓰는 비용이 보존 비용보다 크다.
- Playwright를 들이지 않고도 설치된 Chrome + Node 내장 `fetch`/`WebSocket`만으로 동작한다(의존성 0).

## 기각된 대안

- **커밋하지 않음(폐기)**: 위 이유.
- **지금 CI 잡으로 통합(build → start → 실측)**: 레이아웃 회귀를 PR에서 막을 수 있지만 headless 타이밍 플래키 위험과 CI 1~2분 추가를 확인 없이 떠안는다. 로컬 10회 연속 통과가 먼저.
- **Playwright로 대체**: 크로스플랫폼·정식 도구지만 새 라이브러리 결정 + 브라우저 바이너리. e2e가 필요해지면 그때 이 스크립트를 흡수하는 방향으로 재검토.

## 결정일

2026-09-10

## 갱신 이력

- 2026-09-10 최초 결정(planning 미결 "실측 스크립트 리포 반영" 해소). 완료 조건 규칙과 CI 통합 조건(10회 연속 통과 후 별도 결정)은 사용자 지정.
- 2026-09-10 구현(`270db9a`) 후 로컬 `--no-build` 10회 연속 68/68 통과(23~24s/회) 확인 → 2-B(CI 통합) 결정 전제 충족. 구현 중 확인: `next start`는 SIGTERM으로 안 끝나 SIGKILL 폴백 필요, 잘못된 Chrome 경로는 spawn 'error' 처리 없이는 크래시.
