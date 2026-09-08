# Galley

> 기술 블로그 초안 파이프라인을 큐로 관리하고, AI가 만든 초안을 **사람이 검수·승인한 뒤** 발행 준비(Zenn 下書き)까지 끝내는 로컬 대시보드.
> 이름은 인쇄 전 교정쇄(_galley proof_) — 조판은 끝났지만 발행 전, 사람이 검수하는 단계에서 따왔다.

<!-- TODO: 스크린샷 (큐 목록 / 실행 상세 2분할 타임라인) -->

## 핵심 기능

- **큐 관리** — 주제를 대기·후보·보류·완료로 관리, 드래그로 우선순위 변경. (`주제_큐.md`와 동기화)
- **파이프라인 실행** — 근거 수집 → 벨로그 본문 → 링크드인 → Zenn → 발행정보·썸네일. 단계별 타임라인.
- **승인 게이트** — 실행 → 승인 대기 → 수정 지시로 해당 단계만 재실행 → 완료. 사람 승인 전엔 공개 발행 없음.
- **실행 이력** — 언제·어떤 모델·토큰·비용·결과를 SQLite에 기록, 목록 조회.
- **모델 어댑터** — 모델을 어댑터로 교체해도 파이프라인 코드 불변. 토큰·비용은 실행마다 기록.

## 설계 원칙

- **사람이 검수하는 파이프라인** — "AI가 글을 쓴다"가 아니라 큐·상태·승인 게이트로 초안 흐름을 지휘한다.
- **경계로 배포 가능성 유지** — 파일 I/O는 `Storage`, DB는 접근 계층, 실행은 `@galley/pipeline` 뒤. 로컬 우선이되 나중을 막지 않는다.
- **디자인 시스템 분리** — `@galley/ui`는 Base UI 위 자체 토큰·컴포넌트. 도메인 무지, 독립 배포 예정.
- **클린룸** — 회사 코드를 보지 않고 정보 구조만 참고해 다시 설계한다.

## 스택

pnpm 모노레포 · Next.js App Router · TypeScript(strict) · Base UI + CSS Modules(자체 디자인 시스템) · SQLite + Prisma · Vitest · lucide

## 구조

```
apps/dashboard      Next.js 앱 (@galley/ui 첫 소비자)
packages/ui         @galley/ui — 자체 디자인 시스템 (독립 배포 예정)
packages/pipeline   @galley/pipeline — 단계 실행·상태머신·모델 어댑터·Storage (서버 전용)
```

자세한 아키텍처·컨벤션 → [CLAUDE.md](./CLAUDE.md) · 왜 그렇게 정했나 → [decisions/](./decisions/) · 왜 만드는가 → [INTENT.md](./INTENT.md)

## 실행 / 테스트

```bash
pnpm install
cp .env.example .env          # 경로·키 채우기
pnpm --filter dashboard dev    # 대시보드 로컬 실행
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @galley/ui build # 디자인 시스템 단독 빌드
```

## AI 활용 방식

초안 생성·반복 작업은 AI 파이프라인이 맡되, 면접에서 설명할 핵심 모듈(파이프라인 상태 머신+승인 게이트, 모델 어댑터 인터페이스)은 직접 작성하고 AI는 테스트·리뷰만 한다. 문서(`decisions/`·`worklog/`)로 결정 맥락과 작업 이력을 남겨, "AI 워크플로우를 지휘하는 프론트엔드"를 증거로 보여준다.

## 라이선스

TBD
