# pnpm 모노레포 구조

## 결정

pnpm workspace 모노레포: `apps/dashboard`(Next.js) + `packages/ui`(@galley/ui) + `packages/pipeline`(@galley/pipeline).

## 이유

- `packages/ui`는 나중에 디자인 시스템으로 독립·npm 배포 예정 → 처음부터 별 패키지로 분리해 경계를 강제한다.
- `packages/pipeline`은 서버 전용 실행 로직 → 앱에서 분리해 나중에 워커로 추출하기 쉽게.
- pnpm workspace는 참고 패키지(markdown-it-aozora-ruby)에서 검증된 세팅.

## 기각된 대안

- **단일 Next.js 앱(패키지 분리 없음)**: ui를 나중에 떼낼 때 경계가 이미 무너져 재작성 필요.
- **turborepo 즉시 도입**: 패키지 3개엔 이득 작음 → turborepo.md 참고(미도입).

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
