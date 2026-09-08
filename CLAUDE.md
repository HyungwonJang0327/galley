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
│ [백엔드] Route Handlers / Server Actions  ──호출──▶  @galley/pipeline (서버 전용) │
│                                                        │  상태머신·모델어댑터·Storage │
│                                                        ▼                       │
│                                        SQLite(Prisma)   ~/blog 파일   zenn-content │
└──────────────────────────────────────────────────────────────────────────────┘
브라우저는 DB·fs·모델 API를 직접 만지지 않는다. 전부 서버 런타임에서만.
```

### 화면 골격 (레이아웃 상세는 decisions/layout.md, 스펙 파일이 우선)

```
┌──────────────────────────────────────────────────────────┐
│ TopBar (다크 #1F2126, 48px, 전체 폭)                       │
│  좌: [☰] Galley  [글][설정](워크스페이스 탭)   우: 모델 칩 ▾ │
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

`근거 수집 → 벨로그 본문 → 링크드인 → Zenn → 발행정보·썸네일`
상태 머신: `실행 → 승인 대기 → (수정 지시 → 해당 단계 재실행) → 완료`.

### 폴더 구조

```
Galley/
├─ apps/
│  └─ dashboard/               # Next.js App Router 앱 (@galley/ui 첫 소비자)
│     ├─ app/
│     │  ├─ (dashboard)/       # 라우트 그룹: TopBar+Sidebar 공유, userId="local" 컨텍스트 자리
│     │  │  ├─ layout.tsx      # TopBar/Sidebar 고정 셸
│     │  │  ├─ queue/          # 큐(대기)·후보·완료 화면 (패턴 A)
│     │  │  └─ runs/           # 실행 이력·진행 중·실행 상세 (패턴 B)
│     │  ├─ api/               # Route Handlers → @galley/pipeline 호출만
│     │  └─ page.tsx           # /queue 로 redirect (루트 page.tsx는 redirect 전용)
│     └─ lib/                  # 도메인 어댑터: 상태→Badge variant 매핑, 사이드바 메뉴 정의, 데이터 페칭
├─ packages/
│  ├─ ui/                      # @galley/ui — 자체 디자인 시스템 (독립 배포 예정, 도메인 단어 금지)
│  │  └─ src/{tokens,primitives,components,patterns,hooks,index.ts}
│  └─ pipeline/                # @galley/pipeline — 단계 실행·상태머신·모델 어댑터·Storage·Zenn push (서버 전용)
├─ INTENT.md  planning.md  CLAUDE.md  COMMIT_CONVENTION.md  README.md
├─ decisions/  worklog/  todo/  docs/
└─ .env(.example)  .gitignore
```

`packages/ui` 내부 구조·경계는 → decisions/ui-package-boundary.md.

## 3. 기술 스택

| 영역          | 선택                                                         | 버전         |
| ------------- | ------------------------------------------------------------ | ------------ |
| 패키지 매니저 | pnpm (workspace: apps/_, packages/_)                         | 설치 시 고정 |
| 앱            | Next.js App Router + React + TypeScript(strict)              | 설치 시 고정 |
| 디자인 시스템 | Base UI(헤드리스) + CSS Modules + 토큰 CSS 변수 + lucide     | 설치 시 고정 |
| DB            | SQLite + Prisma (접근 계층 뒤, Postgres 전환 대비)           | 설치 시 고정 |
| 파이프라인    | @galley/pipeline (서버 전용, Storage/모델 어댑터 인터페이스) | —            |
| DnD           | pragmatic-drag-and-drop (apps/dashboard)                     | 설치 시 고정 |
| 테스트        | Vitest                                                       | 설치 시 고정 |
| 빌드(ui)      | tsup (ESM+CJS+d.ts) + Changesets                             | 설치 시 고정 |
| 린트/포맷     | ESLint + Prettier + typescript-eslint                        | 설치 시 고정 |

> 설치 후 실제 버전으로 이 표를 갱신한다.

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
- **루트 `page.tsx`는 `/queue` redirect 전용.** 여기에 화면을 그리지 않는다.
- **`packages/ui`에 도메인 단어(주제·큐·실행·Zenn·벨로그) 금지.** ui는 `Badge` variant를 알지 "승인 대기"를 모른다.
- **`@galley/ui` 딥 임포트 금지**(`@galley/ui/src/...` ✗). 공개 배럴만.
- **로컬 절대경로 하드코딩 금지.** `BLOG_DIR`·`REPO_DIRS`·`ZENN_CONTENT_DIR`·SQLite 경로는 `.env`.
- **비밀값(API 키·Zenn 토큰)은 `.env`에만.** 코드·SQLite·산출물 파일에 절대 쓰지 않는다.
- **macOS 전용 명령(`open`, `pbcopy`)·경로 구분자 가정 금지.**
- `.env*`(except `.env.example`)·`.mcp.json`·`.claude/settings.local.json`은 gitignore.

## 6. 금지

- 결정(decisions/) 없이 라이브러리 추가.
- `any`. 테스트 없는 기능.
- 회사 코드 복사.
- WIP·무의미 커밋. 여러 작업을 모아 한 번에 커밋.

## 7. 작업 흐름

`todo/{역할}-todo 확인 → 브랜치 → 구현 → 테스트 → 기능 최소 단위마다 즉시 커밋 → /log → PR`

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
