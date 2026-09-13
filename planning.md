# planning.md — Galley

> **확정 사항만.** 왜 그렇게 정했나는 `decisions/`, 오늘 한 일은 `worklog/`, 다음 작업은 `todo/`.
> 이 파일에 맥락·일지를 중복해서 쓰지 않는다.

## 서비스 개요

기술 블로그 초안 파이프라인을 큐로 관리하고, 실행 결과를 사람이 검수·승인한 뒤 발행 준비(Zenn 下書き)까지 끝내는 로컬 대시보드. → [INTENT.md](./INTENT.md)

## 확정된 기술 스택

| #    | 영역                 | 확정                                                  | 근거                                      |
| ---- | -------------------- | ----------------------------------------------------- | ----------------------------------------- |
| ①    | DB 접근 계층         | SQLite + Prisma                                       | decisions/db-access-layer.md              |
| ②    | 파이프라인 실행 위치 | 별도 워커 프로세스(SQLite 폴링·heartbeat)             | decisions/run-location.md (② 변경)        |
| ③    | 큐 동기화 방향       | 파일(주제_큐.md)이 진실, DB 파생 캐시                 | decisions/queue-sync-direction.md         |
| ④    | Zenn push            | GitHub 연동 리포 커밋(published:false)                | decisions/zenn-push.md                    |
| ⑤    | ui 스타일            | CSS Modules + 토큰 CSS 변수                           | decisions/ui-style.md                     |
| ⑥    | DnD                  | pragmatic-drag-and-drop (apps/dashboard)              | decisions/dnd-library.md                  |
| ⑦    | 사이드바 접힘 저장   | localStorage                                          | decisions/sidebar-collapse-persistence.md |
| ⑧    | turborepo            | 미도입(pnpm --filter)                                 | decisions/turborepo.md                    |
| ⑨    | 시크릿 스캔          | gitleaks (CI + pre-commit)                            | decisions/secret-scanning.md              |
| ⑩    | dashboard 테스트     | vitest + happy-dom + testing-library (ui와 동일)      | decisions/dashboard-testing.md            |
| ⑪    | 레이아웃 실측        | headless Chrome CDP 스크립트 + CI `layout` 잡(병렬)   | decisions/layout-measurement.md           |
| ⑫    | 환경 변수 파일       | 루트 `.env` 하나 (Node 내장 로더)                     | decisions/env-location.md                 |
| 공통 | 모노레포             | pnpm (apps/dashboard + @galley/ui + @galley/pipeline) | decisions/monorepo.md                     |
| 공통 | UI 기반              | Base UI(헤드리스), shadcn/ui 기각                     | decisions/base-ui-over-shadcn.md          |

## 확정 기능 범위

### 포함 (Phase 1)

- 큐 관리: **큐 1화면 + 탭 4개(대기/후보/보류/완료)**, 순서 변경(DnD), 섹션 이동, `주제_큐.md` 반영, 파일 기준 수동 갱신(큐 헤더 버튼, 자동 적재와 병행 — decisions/queue-sync-direction.md)
- 파이프라인 실행: **6단계**(근거 수집 → 벨로그 본문 → 근거 검증 → 링크드인 → Zenn → 발행정보·썸네일) 상태 머신 + 승인 게이트(실행→승인 대기→수정 재실행→완료). **별도 워커 프로세스가 실행**(decisions/run-location.md)
- 모델 어댑터 인터페이스(교체 가능 + 토큰·비용 기록) + **실행별 모델 선택**(모델은 Run 속성, 어댑터 레지스트리 — decisions/model-selection.md)
- **리포 인덱스**: 연결 리포를 워커가 한 번 훑어 분석 글(포인터 ≥ 1)을 SQLite에 캐시, HEAD 변경 시 증분 재인덱싱. 인덱싱 모델 기본 Haiku 4.5(레지스트리 상수) + CLI `--model`. 입력 상한 16KB/20개·160KB/30개. Phase 1-B 진입은 CLI `index <path>`. 주제↔분석 글 자동 연결(키워드·기간, `TopicAnalysisLink` 슬러그 키) + 큐 행 "근거 편집" (decisions/evidence-collection.md)
- **근거 수집·근거 검증**: 실행마다 분석 글 포인터를 따라 원본 코드 조각을 읽어 EvidenceBundle 생성(snippet은 `DATA_DIR`에만, `posts/<슬러그>/evidence.json`은 포인터만), 본문 입력은 EvidenceBundle뿐. discovered는 키워드 점수만(상한 8). 본문 뒤 근거 검증이 주장(정규식 + 서술은 모델)을 대조해 `verification.json`(supported/unsupported/uncertain) — 표시 조건, 실패 아님. 식별 정보 필터 `.galley/redact.json` 한 곳
- **단계 구현(모델 호출)**: 벨로그 본문·링크드인·Zenn 단계는 StepRunner 구현이 ModelAdapter를 부른다. **어투 프롬프트는 `.galley/prompts/{velog,linkedin,zenn}.md`**(리포 파일, 사람 편집)이고 읽은 내용의 해시를 `RunStep.promptHash`에 기록한다(UI 노출 없음 — decisions/tone-prompts.md)
- 실행 이력 SQLite 저장·조회
- 산출물 쓰기: `posts/<슬러그>/` 5개 파일 + 썸네일(make_thumb.py 호출) + `evidence.json`(포인터)·`verification.json` = 7개. 발행정보에 `## 근거` 섹션(EvidenceBundle에서 생성)
- 화면: TopBar/Sidebar 셸(사용 흐름 순 IA — decisions/navigation.md), 큐(패턴 A·탭 4개), 실행 상세(패턴 B)
- 컴포넌트 갤러리(`/design`, 셸 안, A3 이후) — 개발 확인용. 정식 쇼케이스(Storybook)는 Phase 2. (decisions/component-gallery.md)

### 제외

- 배포·인증·멀티유저 구현 (구조만 유지 — decisions/deploy-readiness.md)
- 자동 공개 발행(velog 공개, Zenn 公開)
- 반응형·모바일 (데스크톱 전용 min-width 1200)
- shadcn/ui, 이모지 아이콘
- 기존 수·토 스케줄 대체 (Phase 2 완료까지 스케줄 유지)

### Phase 2 (예정, 지금 구현 안 함)

- AI 주제 후보 생성 (모델 어댑터 활용)
- Zenn push 실 연동 + 원격 배포 판단
- 설정 화면(리포 연결 `/settings/repos` — 인덱싱 상태·재인덱싱·모델·비용, `/settings/prompts`는 `.galley/prompts/*.md` 파일 편집 UI — 저장소를 DB로 바꾸지 않는다), 비용 칩(인덱싱 비용 포함)
- 근거 검증 unsupported 본문 밑줄, discovered 후보 모델 재순위 (evidence-collection)
- **단계별 모델 오버라이드**(스키마는 Phase 1부터 `RunStep.modelId`로 대비 — decisions/model-selection.md)
- 모델 단가·레지스트리 외부화(설정 파일 / provider 가격 API)
- Storybook 실행 환경
- 스케줄을 DB 연동으로 이전할지 판단

## 라우트 (decisions/navigation.md)

| 경로                          | 화면                       | 패턴           | Phase         |
| ----------------------------- | -------------------------- | -------------- | ------------- |
| /                             | 홈(요약 대시보드)          | A 변형(요약형) | 1 (분할)      |
| /queue                        | 큐(탭 대기/후보/보류/완료) | A              | 1             |
| /runs                         | 실행(2분할 상세, ?id=)     | B              | 1             |
| /runs/history                 | 이력(표)                   | A              | 2 (빈 페이지) |
| /publish                      | 발행 대기(글×채널 3)       | A              | 2 (빈 페이지) |
| /settings/repos·model·prompts | 설정 폼                    | A 변형         | 2             |
| /design                       | 컴포넌트 갤러리            | —              | dev 전용      |

- 루트 `/`: **홈(요약 대시보드).** redirect 제거(2026-09-09 결정 변경 — decisions/navigation.md). 사이드바 맨 위 단독 "홈" 항목. 구현 분할: 뼈대+다음 실행 먼저, 승인 대기·최근 실행(B1e)·발행 대기(Phase 2) 뒤.
- 구 경로 /queue/candidates·/queue/done·/runs/active·/publish/zenn·/publish/velog → redirect.
- TopBar 워크스페이스 탭 제거(워크스페이스 개념 폐기).

## 핵심 결정 표 (변경 불가 / 변경 시 decisions에 "결정 변경" 기록)

| 결정                | 요지                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 로컬 우선           | 배포 보류, 가능성만 유지("막지 않기")                                                                             |
| 승인 게이트         | 사람 승인 전 공개 발행 코드 없음. Zenn 下書き까지만                                                               |
| 클린룸              | 회사 리포 미열람·미복사                                                                                           |
| 팀 네이밍           | 역할명 그대로(사람 이름 금지)                                                                                     |
| ui 경계             | @galley/ui는 도메인 단어·next·앱 의존 금지, 공개 배럴만                                                           |
| 핵심 모듈 직접 작성 | (a') 실행 상세 2분할 화면(B2c), (b) 모델 어댑터(BM1 완료) — AI는 테스트·리뷰만. (a) 상태 머신에서 2026-09-12 교체 |

## 미결 질문

- ~~apps/dashboard 단위 테스트 인프라 도입 여부~~ **해소(2026-09-10)** → decisions/dashboard-testing.md(vitest+happy-dom+testing-library, ui와 동일). ~~레이아웃 실측 스크립트 리포 반영~~ **해소(2026-09-10)** → decisions/layout-measurement.md(`apps/dashboard/scripts/verify-layout/`, 수동 `verify:layout`).
- ~~실측 스크립트 CI 통합(2-B)~~ **해소(2026-09-10)** → decisions/layout-measurement.md 결정 변경: CI `layout` 잡을 `verify`와 병렬로 항상 실행 + 실패 시 스크린샷 artifact(A). required check 등록 완료(2026-09-10, 사용자 — decisions/branch-protection.md).
- ~~사이드바 IA 재정비~~ **해소(2026-09-08)** → decisions/navigation.md 확정. layout.md §2~§4·라우트 표·CLAUDE.md·todo AN1~6 반영. 구현은 승인 후 AN1부터.
