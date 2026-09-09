# CLAUDE.md — Galley

> **결정 맥락은 `decisions/`, 확정 목록은 `planning.md`, 오늘 한 일은 `worklog/`, 다음 작업은 `todo/`.**
> 이 파일은 에이전트 최우선 지침이다. 현재 상태는 여기 적지 않는다 — 상태는 planning/todo/worklog에만 있다.

## 1. 개요

Galley는 기술 블로그 초안 파이프라인을 큐로 관리하고, 실행 결과를 사람이 검수·승인한 뒤 발행 준비까지 끝내는 **로컬 대시보드**다.
프레이밍은 "AI가 글을 쓴다"가 아니라 "**사람이 검수하는 초안 파이프라인**"이다(교정쇄=galley proof).
왜 만드는지·완료 기준·비목표는 → [INTENT.md](./INTENT.md).

## 2. 아키텍처

### 런타임 (로컬, Next.js 프로세스 하나)

```
브라우저 ──HTTP──┐
                ▼
┌───────── apps/dashboard (Next.js App Router, 서버+클라 한 프로세스) ─────────┐
│ [프론트] Server/Client Components (@galley/ui 화면)                           │
│      ↕ HTTP                                                                   │
│ [백엔드] Route Handlers / Server Actions  ── Run을 queued로 생성 ──┐          │
└───────────────────────────────────────────────────────────────────┼──────────┘
                        SQLite(Prisma) ◀── 상태로만 소통(신호 없음) ──┤
                              ▲                                        │
                              │ 폴링(2s)·heartbeat                     ▼
┌─────────── worker (packages/pipeline/bin/worker.ts, 별도 프로세스) ───────────┐
│ queued Run을 running으로 잡고 단계 실행. ModelRegistry·상태머신·Storage.       │
│ 동시 1개. 중단(heartbeat 30s 공백)→interrupted→완료 단계 다음부터 재개.        │
│ IndexJob(리포 인덱싱)도 같은 루프가 집어감(Run 우선). RepoIndex → SQLite 캐시. │
│         @galley/pipeline (서버 전용)  →  ~/blog 파일 · zenn-content            │
│                                       →  연결 리포(읽기만: git show/log)       │
└──────────────────────────────────────────────────────────────────────────────┘
브라우저는 DB·fs·모델 API를 직접 만지지 않는다. 대시보드는 Run을 queued로 만들고
running일 때만 폴링한다. 실행은 워커가 한다. (decisions/run-location.md)
근거 흐름: RepoIndex(분석 글+포인터, SQLite) → 실행 시 포인터로 원본 조각 읽기
→ EvidenceBundle(snippet은 DATA_DIR, posts/<슬러그>/evidence.json은 포인터만) → 본문 → 근거 검증
→ VerificationReport(verification.json). (decisions/evidence-collection.md)
```

### 화면 골격 (레이아웃 상세는 decisions/layout.md, 스펙 파일이 우선)

```
┌──────────────────────────────────────────────────────────┐
│ TopBar (다크 #1F2126, 48px, 전체 폭)                       │
│  좌: [☰] Galley                              우: 모델 칩 ▾ │
├────────────┬─────────────────────────────────────────────┤
│ Sidebar    │ Content (#F5F6F8)                            │
│ (흰 220~240)│  h1 (여백 24)                                │
│  주제/실행/ │  흰 카드(라운드 8~12) 안에 본문               │
│  발행/설정  │  패턴 A(목록형) 또는 B(2분할 상세) — 둘만 존재 │
└────────────┴─────────────────────────────────────────────┘
```

- 데스크톱 전용(min-width 1200), 라이트 테마만(다크는 토큰 자리만). 포인트 색 블루 1개.
- 활성 판정은 **URL(pathname) 기준**. 레이아웃은 `app/(dashboard)/layout.tsx` 하나에 고정, 페이지는 카드 안만 갈아끼움.

### 파이프라인 단계 (순서 고정)

`근거 수집 → 벨로그 본문 → 근거 검증 → 링크드인 → Zenn → 발행정보·썸네일` (6단계, decisions/evidence-collection.md)
상태 머신: `실행 → 승인 대기 → (수정 지시 → 해당 단계 재실행) → 완료`. 근거 검증의 unsupported는 표시 조건이지 실패가 아니다. 본문 재실행 시 근거 검증 자동 재실행, 근거 수집은 기본 건너뜀.

### 폴더 구조

```
Galley/
├─ apps/
│  └─ dashboard/               # Next.js App Router 앱 (@galley/ui 첫 소비자)
│     ├─ app/
│     │  ├─ (dashboard)/       # 라우트 그룹: TopBar+Sidebar 공유, userId="local" 컨텍스트 자리
│     │  │  ├─ layout.tsx      # TopBar/Sidebar 고정 셸
│     │  │  ├─ page.tsx        # 홈(요약 대시보드) — 루트 / (목록형 A의 변형 "요약형", decisions/navigation·layout)
│     │  │  ├─ queue/          # 큐 1화면(탭 대기/후보/보류/완료) (패턴 A) — 행 ⋮ "근거 편집" Dialog
│     │  │  ├─ runs/           # 실행 상세(2분할)·이력 (패턴 B) — 타임라인 6줄(근거 수집·검증 펼침)
│     │  │  └─ settings/repos/ # 리포 연결·인덱싱 상태 (Phase 2, Phase 1-B는 CLI index)
│     │  └─ api/               # Route Handlers → @galley/pipeline 호출만
│     └─ lib/                  # 도메인 어댑터: 상태→Badge variant 매핑, 사이드바 메뉴 정의, 데이터 페칭
├─ packages/
│  ├─ ui/                      # @galley/ui — 자체 디자인 시스템 (독립 배포 예정, 도메인 단어 금지)
│  │  └─ src/{tokens,primitives,components,patterns,hooks,index.ts}
│  └─ pipeline/                # @galley/pipeline — 단계 실행·상태머신·모델 어댑터(ModelRegistry)·Storage·Zenn push (서버 전용)
│     ├─ src/index/            # RepoIndex — 리포 인덱서(분석 글 RepoAnalysis·IndexJob·증분 재인덱싱) (decisions/evidence-collection.md)
│     ├─ src/evidence/         # EvidenceBundle(근거 수집)·VerificationReport(근거 검증)·redact 필터
│     ├─ bin/worker.ts         # 워커 프로세스(pnpm --filter @galley/pipeline worker) — queued Run·IndexJob 폴링·실행 (decisions/run-location.md)
│     └─ bin/index.ts          # 인덱싱 CLI(pnpm --filter @galley/pipeline index <path>) — Phase 1-B 진입점
├─ INTENT.md  planning.md  CLAUDE.md  COMMIT_CONVENTION.md  README.md
├─ decisions/  worklog/  todo/  docs/
├─ .galley/redact.json         # 식별 정보 필터(회사명·도메인·키·이메일·내부 URL 패턴) — 한 곳
└─ .env(.example)  .gitignore
```

`packages/ui` 내부 구조·경계는 → decisions/ui-package-boundary.md.

## 3. 기술 스택

| 영역          | 선택                                                         | 버전 (2026-09-08 기준)                                |
| ------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| 패키지 매니저 | pnpm (workspace: apps/\*, packages/\*)                       | 10.26.2 (node ≥20)                                    |
| 앱            | Next.js App Router + React                                   | next 16.3.4 · react 19.2.8                            |
| 언어          | TypeScript (strict)                                          | 6.0.3 (7.x 보류 — decisions/toolchain-pins.md)        |
| 디자인 시스템 | Base UI(헤드리스) + CSS Modules + 토큰 CSS 변수 + lucide     | 미설치 (컴포넌트 작업 시 추가)                        |
| DB            | SQLite + Prisma (접근 계층 뒤, Postgres 전환 대비)           | prisma 6.19.3 (7↑ 보류 — decisions/toolchain-pins.md) |
| 파이프라인    | @galley/pipeline (서버 전용, Storage/모델 어댑터 인터페이스) | —                                                     |
| 모델 SDK      | @anthropic-ai/sdk · openai (packages/pipeline만)             | 0.124.0 · 7.12.1                                      |
| DnD           | pragmatic-drag-and-drop (apps/dashboard)                     | 미설치 (Phase 1-A)                                    |
| 테스트        | Vitest                                                       | 5.0.0                                                 |
| 빌드(ui)      | Vite 라이브러리 모드 (ESM+CJS+스코프 CSS+d.ts) + Changesets  | vite 8.2.2 · vite-plugin-dts 5.1.0 · changesets 3.0.2 |
| 린트/포맷     | ESLint + Prettier + typescript-eslint                        | eslint 10.10.0 · prettier 3.9.6 · tseslint 8.70.0     |
| 시크릿·훅     | gitleaks + lefthook (pre-commit + CI)                        | gitleaks 8.30.1 · lefthook 2.1.12                     |

> 미설치 항목은 해당 Phase 작업 시 설치하고 버전을 갱신한다. 버전 핀·빌드 우회 사유는 decisions/toolchain-pins.md.

## 4. 코딩 컨벤션

- **네이밍**: 컴포넌트 `PascalCase`, 파일은 컴포넌트명과 동일(`Button.tsx`). 훅 `useXxx`. 유틸/변수 `camelCase`. 상수 `UPPER_SNAKE`.
- **컴포넌트 = 폴더 하나**(`packages/ui`): `X/{index.ts, X.tsx, X.module.css, X.test.tsx, X.stories.tsx}`.
- **export**: 명명 export 우선(default export 금지, Next 페이지·layout 등 프레임워크 요구 제외). 공개 API는 `packages/ui/src/index.ts` 배럴에서만.
- **스타일 토큰**: 색·간격·타이포·라운드·그림자는 `tokens/`의 CSS 변수(`--ui-*`)만 참조. **하드코딩 색·px 금지.**
- **타입**: `strict`. `any` 금지(불가피하면 `unknown`+좁히기). 도메인 타입은 앱/파이프라인에, ui는 표현 props 타입만.
- **상태 관리**: 서버 상태는 서버(Route Handler/Server Component)에서. 클라 상태 최소화. 사이드바 접힘·활성은 URL/localStorage(서버 상태로 만들지 않음).
- **에러 응답 형태**: Route Handler는 `{ ok: false, error: { code, message } }` / 성공은 `{ ok: true, data }`. 던지지 말고 형태로 반환.

## 5. 중요 — 이 프로젝트 함정

- **회사 리포 경로(`~/Desktop/Flowing-Repository`, `Flowing-Legacy`)를 열지 않는다.** 클린룸.
- **`~/Desktop/blog`의 기존 파일을 덮어쓰지 않는다.** 산출물은 새 슬러그 폴더(`posts/<슬러그>/`)에만 쓴다.
  - 예외: `주제_큐.md`는 Galley가 쓸 수 있는 유일한 기존 파일. 단 **섹션 구조(대기/후보/보류/완료)·줄 순서를 깨지 않는다.**
- **공개 발행 API(velog 공개, Zenn 公開)를 호출하는 코드를 만들지 않는다.** Zenn은 `published:false`(下書き)까지만.
- **루트 `/`는 홈(요약 대시보드).** `app/(dashboard)/page.tsx`가 셸 안에서 그린다. redirect 아님(2026-09-09 결정 변경 — decisions/navigation.md). 목록형(A)의 변형 "요약형"이며 새 패턴이 아니다.
- **`packages/ui`에 도메인 단어(주제·큐·실행·Zenn·벨로그) 금지.** ui는 `Badge` variant를 알지 "승인 대기"를 모른다.
- **`@galley/ui` 딥 임포트 금지**(`@galley/ui/src/...` ✗). 공개 배럴만.
- **로컬 절대경로 하드코딩 금지.** `BLOG_DIR`·`REPO_DIRS`·`ZENN_CONTENT_DIR`·`DATA_DIR`·SQLite 경로는 `.env`.
- **회사 코드 조각(EvidenceBundle snippet)은 `DATA_DIR`에만 쓴다.** `~/Desktop/blog` 아래에는 포인터(커밋·경로·라인)만. blog 폴더 밖으로 나갈 경로를 만들지 않는다 — decisions/evidence-collection.md.
- **비밀값(API 키·Zenn 토큰)은 `.env`에만.** 코드·SQLite·산출물 파일에 절대 쓰지 않는다.
- **모델 id·단가를 앱 코드에 하드코딩하지 않는다. `ModelRegistry`(packages/pipeline)만 안다.** 앱·단계 코드는 어댑터 id만 받고 provider를 모른다. 모델은 실행(Run) 속성 — decisions/model-selection.md.
- **파이프라인은 대시보드가 아니라 워커가 실행한다.** 대시보드는 Run을 `queued`로 만들 뿐, 워커에 직접 신호를 보내지 않는다(수정 지시·승인도 Run 상태 변경으로만) — decisions/run-location.md.
- **요약만으로 본문을 쓰지 않는다. 본문 단계 입력은 EvidenceBundle뿐**(주제 + 원본 조각 + 어투 프롬프트). 리포 경로·분석 글 원문이 들어갈 자리를 입력 타입에 두지 않는다 — decisions/evidence-collection.md.
- **읽기 전용 리포에 쓰기 금지.** 인덱싱·근거 수집은 `git show`·`git log` 등 읽기 명령만. 파일·브랜치·git 상태를 바꾸는 명령을 리포 경로에서 실행하지 않는다. 테스트는 tmpdir 픽스처 리포로만(회사 리포 미열람은 그대로).
- **식별 정보 필터는 `.galley/redact.json` 한 곳.** 인덱싱(summary·note)과 EvidenceBundle(snippet) 양쪽이 같은 함수를 쓴다. 패턴을 코드에 흩어 두지 않는다.
- **macOS 전용 명령(`open`, `pbcopy`)·경로 구분자 가정 금지.**
- `.env*`(except `.env.example`)·`.mcp.json`·`.claude/settings.local.json`은 gitignore.
- **pnpm 10은 네이티브 패키지 빌드 스크립트를 차단.** 새 네이티브 도구(esbuild·lefthook 등) 추가 시 `pnpm.onlyBuiltDependencies`에 넣어야 빌드된다. (decisions/toolchain-pins.md)

## 6. 금지

- 결정(decisions/) 없이 라이브러리 추가.
- `any`. 테스트 없는 기능.
- 회사 코드 복사.
- WIP·무의미 커밋. 여러 작업을 모아 한 번에 커밋.

## 7. 작업 흐름

`todo/{역할}-todo 확인 → 브랜치(type/scope-desc) → 구현 → 테스트 → 기능 최소 단위마다 즉시 커밋 → /log → PR → CI 초록 → rebase merge → 브랜치 삭제`

- main은 보호됨(직접 push 금지, PR·CI 필수, force-push 금지). 브랜치·머지 규칙은 [COMMIT_CONVENTION.md](./COMMIT_CONVENTION.md) 브랜치 절.

## 8. 커밋 단위 규칙

- **한 커밋 = 한 가지 변경**(기능 하나·버그 하나·리팩토링 하나). 여러 작업을 모아 한 번에 커밋 금지.
- 기능이 커도 독립적으로 되돌릴 수 있는 단위로 쪼갠다: `타입 추가 → 서비스 로직 → UI → 테스트`.
- 커밋 하나를 revert해도 나머지가 깨지지 않아야 한다.
- 형식은 [COMMIT_CONVENTION.md](./COMMIT_CONVENTION.md).

## 9. 진행 단위 규칙

- 작업은 항상 **작은 기능 단위 하나씩**. 하나가 끝나면 **[테스트 → 커밋 → /log → 결과 보고]** 까지 한 뒤 **"다음 진행할까?"** 를 묻고 멈춘다.
- 승인 없이 다음 작업으로 넘어가지 않는다. 여러 작업을 이어서 처리하지 않는다.
- 결정은 사용자가 한다. 에이전트는 선택지와 근거를 제시한다.

## 10. 자주 쓰는 명령어

```bash
pnpm install
pnpm --filter @galley/ui build          # 디자인 시스템 단독 빌드(독립 배포 검증)
pnpm --filter @galley/ui test
pnpm --filter dashboard dev              # 대시보드 로컬 실행
pnpm lint && pnpm typecheck && pnpm test # 전체 검증
```

> 커맨드: `/log /decide /brief /review /status /retro /retro-public /agent /ship /demo`
