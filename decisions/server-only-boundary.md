# 서버 전용 경계 강제: `server-only`

## 결정

`@galley/pipeline`의 **런타임 값**(함수·상수·`prisma`)을 import하는 `apps/dashboard` 파일은 첫 줄에 `import 'server-only'`를 둔다. 그 파일이 클라이언트 번들(`'use client'` 컴포넌트의 import 체인)에 들어가면 Next 빌드가 그 자리에서 명확한 메시지로 실패한다.

- 대상: `apps/dashboard/lib/*`와 `app/**` 중 pipeline 값을 가져오는 파일. **타입만**(`import type`) 가져오는 파일은 대상이 아니다 — 타입은 번들에 남지 않는다.
- 클라이언트 컴포넌트가 pipeline 어휘(상태·단계 이름)로 판단해야 하면, **서버 컴포넌트가 판정해 결과만 props로** 넘긴다(`RunPoller`의 `active`). 클라이언트 쪽에서 표시 매핑 파일(`run-labels` 등)을 import하지 않는다.
- 테스트(vitest·happy-dom)는 `server-only`를 빈 모듈로 alias한다(`apps/dashboard/vitest.config.mts`). 이 패키지는 Node 기본 조건에서 import되면 던지므로 alias가 없으면 lib 테스트가 전부 실패한다.
- `packages/pipeline` 자체에는 두지 않는다. 워커·인덱싱 CLI가 같은 소스를 순수 Node로 실행한다(decisions/node-runtime.md).

## 이유

- 2026-09-14 `/runs` 진입이 500으로 터졌다. `'use client'`인 `RunPoller`가 `lib/run-labels`의 `isRunInProgress`를 가져왔고, run-labels는 pipeline 배럴에서 `RUN_STATUS`를 가져오므로 Prisma·`node:fs`가 브라우저 청크에 딸려 들어가 Turbopack이 페이지 컴파일에 실패했다.
- 이 종류의 오류는 **테스트·typecheck·lint가 잡지 못한다.** happy-dom 테스트는 Node 모듈을 그냥 로드하고, 타입 검사는 번들 경계를 모른다. dev 서버에서 그 페이지를 열어야만 드러난다.
- CLAUDE.md는 pipeline을 "서버 전용"이라고 적었지만 강제 장치가 없었다. 큐 화면의 클라이언트 컴포넌트는 우연히 타입만 가져와서 안 터졌을 뿐이다(`queue-row-menu.ts` 주석이 그 관행을 적어 두었다). 관행을 빌드 실패로 바꾼다.
- `server-only`는 Next가 지원하는 공식 마커 패키지(0.0.1, 코드 한 줄)라 유지 비용이 없다.

## 기각된 대안

- **ESLint `no-restricted-imports`로 `'use client'` 파일의 pipeline 값 import 금지**: 설치는 없지만 직접 import만 잡는다. 이번처럼 한 단계 건너(`RunPoller → run-labels → pipeline`) 들어오는 경로는 못 잡는다.
- **pipeline에 브라우저 안전한 서브 진입점(`@galley/pipeline/status`) 추가**: 상태 어휘를 클라에서 쓸 수 있게 되지만 exports 구조 변경이 필요하고, 지금 필요한 곳이 하나뿐이다. 필요가 늘면 그때 별도 결정.
- **`packages/pipeline/src/index.ts`에 마커 두기**: 워커가 순수 Node로 같은 파일을 읽으므로 던진다.

## 결정일

2026-09-14

## 갱신 이력

- 2026-09-14 신설. 계기는 B2c(실행 상세) `RunPoller` 500.
