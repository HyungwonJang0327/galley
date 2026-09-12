# 레이아웃 실측 스크립트 (headless Chrome CDP)

## 결정

AppShell 스크롤 구조·Select·Menu 팝업을 검증한 CDP 실측 스크립트를 리포에 둔다.

- 위치: `apps/dashboard/scripts/verify-layout/` — `run.mjs`(진입점) · `cdp.mjs`(Chrome 실행·CDP 연결 공통) · `shell-scroll.mjs` · `select.mjs` · `menu.mjs`(검사 모듈). 실행: `pnpm --filter dashboard verify:layout`.
- 동작: 프로덕션 빌드(`next build`) → `next start` → `/design`을 headless Chrome으로 열어 실측 → PASS/FAIL 목록 + 종료 코드. `--no-build`(기존 `.next` 재사용) · `--url <base>`(떠 있는 서버 사용) · `--out <dir>`(스크린샷) 옵션.
- **CI 통합(2-B, 2026-09-10 결정 변경 — 처음엔 수동·CI 미포함이었고 로컬 10회 연속 통과 확인 뒤 별도 결정으로 미뤄 둔 것을 채택)**: `.github/workflows/ci.yml`의 **`layout` 잡**이 `verify`와 **병렬로 항상** 실행된다(install → `@galley/ui` build → **한글 폰트 `fonts-nanum` 설치** → `verify:layout --out`). 러너에 CJK 폰트가 없으면 한글이 notdef 박스로 그려져 텍스트 폭 검사가 실제와 다르게 판정된다. 실패 시 스크린샷(`shell-scroll.png`·`select-N.png`)을 artifact `layout-screenshots`로 올린다. dashboard `next build`가 CI에 들어가는 첫 지점이기도 하다. **required check로 등록됨**(2026-09-10, 사용자가 GitHub 설정에서) — `layout`이 빨간 PR은 머지할 수 없다(decisions/branch-protection.md).
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
- **지금 CI 잡으로 통합(build → start → 실측)**: 레이아웃 회귀를 PR에서 막을 수 있지만 headless 타이밍 플래키 위험과 CI 1~2분 추가를 확인 없이 떠안는다. 로컬 10회 연속 통과가 먼저. → **10회 연속 통과 확인 후 채택(2-B, 아래 갱신 이력)**.
- 2-B에서 기각
  - **A + 경로 필터**(patterns·`/design`·스크립트 변경 시만 실행): 러너 시간은 아끼지만 required check로 등록하면 skipped 잡이 "expected"로 남아 머지가 막히는 GitHub 함정(동명 no-op 워크플로가 따로 필요). 토큰·전역 CSS 변경 같은 간접 회귀도 놓친다.
  - **`verify` 잡 끝 스텝**: yaml은 최소지만 매 PR `verify`가 직렬 +1.5~2분. 레이아웃 플래키가 lint·test 결과까지 빨갛게 만들어 신호가 섞인다.
  - **수동 유지**: 완료 조건 규칙이 사람 기억에 의존해 회귀가 머지될 수 있다.
- **Playwright로 대체**: 크로스플랫폼·정식 도구지만 새 라이브러리 결정 + 브라우저 바이너리. e2e가 필요해지면 그때 이 스크립트를 흡수하는 방향으로 재검토.

## 결정일

2026-09-10

## 갱신 이력

- 2026-09-10 최초 결정(planning 미결 "실측 스크립트 리포 반영" 해소). 완료 조건 규칙과 CI 통합 조건(10회 연속 통과 후 별도 결정)은 사용자 지정.
- 2026-09-10 구현(`bdf9d24`, PR #43) 후 로컬 `--no-build` 10회 연속 68/68 통과(23~24s/회) 확인 → 2-B(CI 통합) 결정 전제 충족. 선택지 제시(A: `verify`와 병렬 별도 잡 + 실패 시 스크린샷 artifact 추천). 구현 중 확인: `next start`는 SIGTERM으로 안 끝나 SIGKILL 폴백 필요, 잘못된 Chrome 경로는 spawn 'error' 처리 없이는 크래시.
- 2026-09-10 **결정 변경(2-B)**: 수동·CI 미포함 → **CI `layout` 잡(A, `verify`와 병렬 + 실패 시 스크린샷 artifact)**. 사용자 결정. 기각 B(경로 필터)·C(`verify` 스텝)·D(수동 유지). 로컬 수동 실행 완료 조건 규칙은 그대로. required check 등록은 초록 확인 뒤 별도. CI에서 드러난 Linux 차이 2건: (1) 브라우저 종료 뒤 자식 프로세스가 프로필에 써서 `rmSync`가 ENOTEMPTY → `removeDir`(재시도 + 실패는 경고, 정리 실패가 결과·원래 오류를 가리지 않게), (2) 러너에 한글 폰트 없음 → `fonts-nanum` 설치 스텝.
- 2026-09-10 `layout`을 **required check로 등록**(PR #45 초록 3회 뒤, 사용자가 GitHub 설정에서). decisions/branch-protection.md 필수 체크 목록 갱신.
- 2026-09-11 검사 모듈 `menu.mjs` 추가(UM2 — 갤러리 Menu 섹션과 함께, 결정 변경 없음). 트리거는 `button[aria-label]`, 열린 팝업은 `[role="menu"][data-open]`로 찾는다. 갤러리 "화면 하단" 카드는 Select·Menu가 공유하며 페이지 맨 아래여야 한다. 이 스크립트가 happy-dom이 못 잡는 "트리거 래퍼가 props를 버려 메뉴가 안 열림"을 잡았다(worklog 2026-09-11).
- 2026-09-12 `select.mjs`에 **팝업 스크롤 안정 대기** 추가. Base UI는 팝업을 연 뒤 비동기로 선택 항목까지 스크롤하는데(측정값: 직후 `scrollTop` 0·선택 항목 top 1841 → 잠시 뒤 `scrollTop` 1484·top 357), 스크립트가 목록이 보이자마자 재고 있어 "[항목 40개] 열릴 때 선택 항목이 보임"이 페이지가 길어지자(AH1 갤러리 카드 2장·AH2 사이드바 홈 항목) 2회 연속 실패했다. **제품 회귀가 아니라 검사 타이밍 결함** — `popup.scrollTop`이 멈출 때까지 기다린 뒤 측정한다.
- 2026-09-12 **Chrome 기동 대기 15초→30초**(사용자 결정). CI `layout`이 `timeout: DevToolsActivePort`로 2회 실패(PR #55·#57, 둘 다 문서 전용 PR — 빌드 뒤 측정 전에 실패, 스크린샷 없음, 실패 잡 재실행으로 통과). required check라 매번 머지가 막혀 `launchChrome`의 DevToolsActivePort 대기만 `tries: 120`(×250ms)으로 늘린다. 정상 기동 시 대기 시간은 그대로이고, 정말 안 뜨는 경우만 실패가 15초 늦어진다. 결정 변경 없음(스크립트 파라미터).
