# Node 24 LTS + 타입 스트리핑으로 워커 실행

## 결정

**Node 24 LTS로 올리고, 워커는 `node bin/worker.ts`로 그대로 돌린다.** TS 런처도, 빌드 단계도 두지 않는다.

- 타입 스트리핑은 22.18·23.6부터 기본 활성화, **24.12·25.2부터 정식(stable)** 이다. Node 24에서는 `--experimental-strip-types` 없이 `.ts`가 그대로 돈다.
- `engines.node`는 `>=24`, CI `setup-node`도 24. launchd plist(BW5)도 같은 버전을 쓴다.
- 워커 스크립트: `node --env-file=../../.env bin/worker.ts` (`.env` 로드는 기존 `db` 스크립트와 같은 방식).

## 이유

- **Node 20은 2026년 4월 EOL**이라 보안 패치가 나오지 않는다. 현재 LTS는 24, 22는 유지보수. **업그레이드는 이 결정 때문이 아니라 어차피 해야 하는 일**이고, 워커 실행 문제는 그 부산물로 풀린다.
- 새 의존성도, 빌드 단계도, 소비 경로 두 갈래도 만들지 않는다.

## 따라오는 제약 (타입 스트리핑)

타입만 걷어내고 **코드 변환은 하지 않는다.** 그래서 세 가지가 걸린다 — 지금은 워커 껍데기가 얇아 문제가 안 되지만 나중에 걸린다.

1. **상대 import에 확장자가 필수**다 — `import { x } from './foo.ts'`. `packages/pipeline` 전체(소스·테스트 148곳)에 `.ts`를 붙였고, `tsconfig`에 `allowImportingTsExtensions`를 켰다(`noEmit`일 때만 켤 수 있다). **`apps/dashboard`도 같은 플래그가 필요하다** — 이 패키지를 소스로 소비하기 때문.
2. **`enum`, 런타임 코드가 있는 `namespace`, 생성자 파라미터 프로퍼티를 쓸 수 없다**(`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). 실제로 `StepFailure`와 `LocalFsStorage`가 파라미터 프로퍼티를 쓰고 있어 필드 선언으로 풀었다.
3. **`node_modules` 안의 TS 파일은 Node가 거부한다.** 워크스페이스 패키지를 **Node에서 직접 import하면** `exports`가 빌드된 JS를 가리켜야 한다.
   - 지금은 문제가 없다: 워커는 `../src/...` **상대 경로로 같은 패키지 안**을 읽고, 대시보드는 Next가, 테스트는 vitest가 TS를 처리한다.
   - `@galley/pipeline`을 Node 프로세스에서 **패키지 이름으로** import하는 순간(예: 별도 CLI) 빌드 산출물이 필요해진다 — todo **TD6**.

## 기각된 대안

- **`tsx` 추가**: Node를 올리면 곧 불필요해진다. 네이티브 의존성(esbuild)이라 `pnpm.onlyBuiltDependencies` 설정도 따라온다(toolchain-pins 함정).
- **`packages/pipeline`에 build 추가 후 `dist` 실행**: 대시보드는 소스, 워커는 dist로 **소비 경로가 갈리고** watch 단계가 는다. 얇은 껍데기 하나 때문에 치르기에는 비싸다.

## 결정일

2026-09-13

## 갱신 이력

- 2026-09-13 최초 결정(BW2 워커 실행 수단). Node 20.17 → 24.21 로컬 업그레이드, `engines >=24`, CI 24. 타입 스트리핑 제약 3가지를 CLAUDE.md 함정 절에 함께 기록. `pnpm rebuild`로 네이티브(esbuild) 재빌드 확인.
