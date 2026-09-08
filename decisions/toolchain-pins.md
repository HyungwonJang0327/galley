# 툴체인 버전 핀·빌드 우회

## 결정

- **TypeScript 6.0.3 고정**(`~6.0`). 최신 7.0.2를 쓰지 않는다.
- **`@galley/ui` 빌드는 Vite 라이브러리 모드**(tsup 아님). ESM+CJS + 스코프 CSS Modules 단일 CSS 추출 + d.ts(vite-plugin-dts).
- **esbuild 빌드 스크립트 허용**: 루트 `package.json`의 `pnpm.onlyBuiltDependencies: ["esbuild"]`.
- **`@galley/ui` tsconfig에 `ignoreDeprecations: "6.0"`**: TS6 `baseUrl` deprecation(TS5101) 무해 무시(d.ts 생성 경로용).
- **Prisma 6.19.3 고정**(`@galley/pipeline`). 7↑을 쓰지 않는다. `onlyBuiltDependencies`에 `@prisma/client`·`@prisma/engines`·`prisma` 추가. `packages/pipeline`에 `postinstall: prisma generate`.

## 이유

- **TS 핀**: `typescript-eslint@8`의 peer가 `typescript <6.1.0`이라 TS7과 충돌(unmet peer). 참고 패키지(markdown-it-aozora-ruby)도 TS6 + typescript-eslint8 조합 사용.
- **Vite over tsup**: tsup(8.x)는 `.module.css`의 **CSS Modules 로컬 스코프를 지원하지 않는다** — JS 측 default import를 빈 객체(`{}`)로 반환하고 CSS는 전역 클래스로 추출한다. 그 결과 `styles.item` 등이 `undefined`가 되어 컴포넌트에 클래스가 붙지 않았다(스타일 전부 미적용). `local-css` 로더 명시도 무시됨. Vite 라이브러리 모드는 스코프 클래스명 컴파일 + JS 로컬 맵 + 단일 CSS 추출을 정식 지원 → 빌드 산출물이 그대로 배포 가능(분리 시점 소요 최소).
- **esbuild 허용**: pnpm 10은 기본적으로 네이티브 패키지 postinstall(빌드 스크립트)을 차단한다. Vite도 esbuild를 쓰므로 허용해야 `@galley/ui` 빌드가 된다.
- **Prisma 6 핀**: npm `latest`는 `8.0.0-rc.13`(RC)라 제외. 최신 안정 major는 7이나 **Prisma 7은 `datasource` 블록에서 `url` 필드를 제거**(`P1012`)하고 연결 URL을 `prisma.config.ts`+driver adapter로 옮기도록 강제한다 → decisions/db-access-layer.md의 `url = env("DATABASE_URL")` + 순수 `new PrismaClient()` 모델, "provider 한 줄 Postgres 전환"과 충돌(+Node 20.19 요구). 그래서 classic 스키마를 유지하는 최신 안정 major 6.19.3으로 고정.
- **Prisma 빌드·생성 배선**: pnpm 10이 `@prisma/client`·`@prisma/engines`·`prisma`의 postinstall(엔진 다운로드·클라이언트 생성)을 차단하므로 셋을 `onlyBuiltDependencies`에 넣는다. 또 `@prisma/client` 타입은 `prisma generate`로만 생기므로 `packages/pipeline`에 `postinstall: prisma generate`를 둬야 CI install 뒤 typecheck가 통과한다.
- **ignoreDeprecations**: TS6이 `baseUrl` 주입을 deprecated 에러(TS5101)로 처리하는 것을 d.ts 생성 경로에서 무해하게 무시.

## 기각된 대안

- **TS 7 사용**: typescript-eslint가 아직 미지원 → 린트 불가.
- **tsup 유지 + CSS Modules 플러그인**: 플러그인 성숙도·추출 안정성 리스크 + 라이브러리 추가. Vite가 정식 지원하므로 불필요.
- **소스 직접 소비(transpilePackages)**: 지금은 되지만 분리 시점에 배포용 빌드를 새로 만들고 앱을 dist 소비로 되돌리는 마이그레이션이 추가됨 → 분리 소요 증가.
- **Prisma 7/8 채택**: `datasource.url` 제거 + `prisma.config.ts`/driver adapter 도입은 새 결정이 필요하고 db-access-layer.md의 전환 모델과 충돌 → 보류. typecheck·연결 모델이 정리되면 상향 재검토.

## 참고: 일시적 설치 이슈

- vitest 5(rolldown 기반, vite 8)의 네이티브 바인딩(`@rolldown/binding-darwin-arm64`)이 최초 설치 때 누락 → `pnpm install --force`로 optional 재수신하여 해결. (플랫폼 바인딩은 CI(리눅스) 호환 위해 package.json에 박지 않는다.)

## 배포 시 변화

없음(개발 툴체인). TS7을 typescript-eslint가 지원하면 핀 상향 재검토.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
- 2026-09-08 `@galley/ui` 빌드를 tsup→Vite 라이브러리 모드로 교체(tsup CSS Modules 스코프 미지원으로 스타일 전부 미적용 → 수정).
- 2026-09-08 A4a: Prisma 6.19.3 핀(7↑의 datasource.url 제거로 결정 모델 충돌) + onlyBuiltDependencies에 prisma 3종 + pipeline postinstall generate 추가.
