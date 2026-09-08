# ⑤ @galley/ui 스타일: CSS Modules + 토큰 CSS 변수

## 결정

`@galley/ui`는 CSS Modules로 스타일링하고, 색·간격·타이포·라운드·그림자는 `tokens/`의 CSS 변수(`--ui-*`)만 참조한다. 다크는 `[data-theme]` + 변수로 자리만 둔다.

## 이유

- 독립 배포 시 소비자 부담 최소: 컴파일된 CSS import만, 별도 config 불필요.
- `sideEffects: ["*.css"]` 규칙과 맞음.
- 하드코딩 색·px 금지 → 토큰 변수로 테마 교체 가능.

## 기각된 대안

- **Tailwind**: 소비자에게 tailwind config·content 스캔 강제 → 디자인 시스템 독립 배포에 부적합.
- **vanilla-extract**: 타입 안전 테마 장점이나 빌드 플러그인·학습 추가. 필요 시 재검토.

## 배포 시 변화

없음(컴파일된 CSS 그대로 소비).

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
