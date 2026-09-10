# 환경 변수 파일: 루트 `.env` 하나

## 결정

리포 루트의 `.env` 하나가 모든 프로세스(대시보드·Prisma CLI·워커·인덱싱 CLI)의 env 소스다. 키 목록은 루트 `.env.example`.

- 로딩은 **Node 내장 기능만** 쓴다(새 의존성 없음).
  - 대시보드: `apps/dashboard/next.config.mjs`가 `process.loadEnvFile(<루트>/.env)`로 읽는다. 파일이 없으면 건너뛴다(CI에는 `.env`가 없다).
  - Prisma CLI: `packages/pipeline` 스크립트가 `node --env-file=../../.env`로 prisma를 실행한다. `prisma generate`(postinstall)는 `DATABASE_URL` 없이 돈다.
  - 워커·인덱싱 CLI(Phase 1-B): 같은 방식(`node --env-file`).
- 이미 설정된 환경 변수가 `.env`보다 우선한다(`process.loadEnvFile`·`--env-file` 모두 덮어쓰지 않음 — 2026-09-11 확인). 픽스처·CI는 셸 env로 값을 바꿔 쓸 수 있다.
- `DATABASE_URL`의 상대경로(`file:./dev.db`)는 Prisma CLI·대시보드 런타임 모두 `packages/pipeline/prisma/schema.prisma` 기준으로 풀린다(2026-09-11 임시 DB로 확인). 어느 프로세스가 읽어도 같은 DB다.
- 패키지별 `.env`(`apps/dashboard/.env`·`packages/pipeline/.env`)는 두지 않는다.
- 루트 `package.json` `engines.node`를 `>=20.12`로 올린다(`process.loadEnvFile`이 들어온 버전. `--env-file`은 20.6).

## 이유

- README(`cp .env.example .env`)·CLAUDE.md·decisions/deploy-readiness.md가 이미 "루트 `.env` 하나"를 전제한다. 실제 파일은 Prisma 기본 규칙 때문에 `packages/pipeline/.env`에만 있었고, Next는 `apps/dashboard/.env`만 읽으므로 **대시보드가 env를 받지 못하는 상태**였다(A5c에서 대시보드가 처음 `BLOG_DIR`·DB를 쓰면서 발견).
- 값이 한 곳에 있으면 `DATABASE_URL` 등이 중복되거나 어긋나지 않는다.
- Node 20.12+의 `process.loadEnvFile`·`--env-file`로 충분하다. dotenv·`@next/env`를 들일 필요가 없다(pnpm 엄격 모드라 `@next/env`도 직접 의존성 추가가 필요했다).

## 기각된 대안

- **패키지별 `.env`**(Next·Prisma 기본 규칙): 설정 코드는 없지만 `DATABASE_URL`이 두 곳에 중복되고 README 안내와 달라진다.
- **대시보드가 `packages/pipeline/.env`를 읽기**: 앱 설정이 다른 패키지 내부 파일에 결합되고, README와도 다르다.
- **dotenv / `@next/env` 의존성 추가**: Node 내장 기능으로 충분하다.

## 결정일

2026-09-11

## 갱신 이력

- 2026-09-11 최초 결정(AN4+A5c 진행 중 대시보드가 env를 못 읽는 문제 발견, 사용자 결정).
