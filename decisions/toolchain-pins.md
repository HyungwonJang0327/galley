# 툴체인 버전 핀·빌드 우회

## 결정

- **TypeScript 6.0.3 고정**(`~6.0`). 최신 7.0.2를 쓰지 않는다.
- **esbuild 빌드 스크립트 허용**: 루트 `package.json`의 `pnpm.onlyBuiltDependencies: ["esbuild"]`.
- **`@galley/ui` tsconfig에 `ignoreDeprecations: "6.0"`**: tsup dts 생성용.

## 이유

- **TS 핀**: `typescript-eslint@8`의 peer가 `typescript <6.1.0`이라 TS7과 충돌(unmet peer). 참고 패키지(markdown-it-aozora-ruby)도 TS6 + typescript-eslint8 조합 사용.
- **esbuild 허용**: pnpm 10은 기본적으로 네이티브 패키지 postinstall(빌드 스크립트)을 차단한다. tsup가 esbuild를 쓰므로 허용해야 `@galley/ui` 빌드가 된다.
- **ignoreDeprecations**: tsup의 dts(rollup-plugin-dts)가 내부적으로 `baseUrl`을 주입하는데, TS6이 이를 deprecated 에러(TS5101)로 처리한다. 해당 플래그로 무해하게 무시.

## 기각된 대안

- **TS 7 사용**: typescript-eslint가 아직 미지원 → 린트 불가.
- **vitest/tsup를 다른 도구로 교체**: 참고 세팅과 어긋나고 이득 없음.

## 참고: 일시적 설치 이슈

- vitest 5(rolldown 기반, vite 8)의 네이티브 바인딩(`@rolldown/binding-darwin-arm64`)이 최초 설치 때 누락 → `pnpm install --force`로 optional 재수신하여 해결. (플랫폼 바인딩은 CI(리눅스) 호환 위해 package.json에 박지 않는다.)

## 배포 시 변화

없음(개발 툴체인). TS7을 typescript-eslint가 지원하면 핀 상향 재검토.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
