# 근거 수집 구조: 리포 인덱스 캐시 + 원본 조각 + 근거 검증

## 결정

**캐시는 "어디를 볼지"를 찾는 용도, "무엇이 쓰여 있는지"는 항상 원본 파일에서 읽는다.**

- 서비스 시작(리포 연결) 시 지정 폴더의 리포를 한 번 훑어 **리포 인덱스**(분석 글 묶음)를 만들고 SQLite에 캐시한다.
- 주제를 큐에 넣을 때 관련 **분석 글**(인덱스 항목)을 주제에 연결해 저장한다.
- 글을 쓸 때는 연결된 분석 글을 **우선** 보되, 분석 글이 가리키는 **원본 코드 조각을 그 시점에 파일에서 읽어** 함께 입력한다. **요약만으로 본문을 쓰지 않는다.**
- 본문 뒤에 **근거 검증** 단계를 두어 초안의 코드 조각·숫자·파일명·함수명이 EvidenceBundle에 있는지 대조한다.
- **회사 코드 조각은 `~/Desktop/blog` 밖으로 나가지 않는다.** snippet은 Galley 데이터 폴더(`DATA_DIR`)에만 저장하고, `posts/<슬러그>/`에는 포인터만 둔다.

## 데이터 모델 (packages/pipeline, Prisma)

| 모델                                   | 필드                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repo**                               | id · path · name · **aliases(JSON)** · readOnly(bool) · headSha · lastIndexedAt · **lastIndexModelId** · status(`indexing`/`ready`/`stale`/`error`)                                                                                                                                                                                                      |
| **RepoAnalysis**(분석 글, 인덱스 단위) | repoId · kind(`overview` 리포 전체 / `area` 디렉터리·기능 영역 / `change` 커밋 묶음·기간별 변경) · title · summary(모델 생성, 한국어) · keywords[] · **pointers[] ≥ 1**(`{ commit, path, lineStart?, lineEnd?, note }`) · period?(change의 기간) · summaryOnly(입력 상한 초과로 파일명·커밋 메시지만 본 경우) · modelId·inputTokens·outputTokens·costUsd |
| **QueueItem 추가**                     | repoNames[] · keywords[] · period? — `주제_큐.md` 괄호 힌트에서 **파서가 채움**(재적재 시 재생성)                                                                                                                                                                                                                                                        |
| **TopicAnalysisLink**(주제↔분석 글)    | topicSlug · analysisId · source(`auto` 키워드 매칭 / `manual` 사용자 편집) — **QueueItem이 아니라 슬러그 키**(전체 리셋 적재에도 살아남음, §충돌 4)                                                                                                                                                                                                      |
| **IndexJob**                           | repoId · 종류(full/incremental) · modelId · 상태 · 진행(디렉터리 n/m) · 토큰·비용 — Run과 **별도 테이블**, TopBar 비용 칩 합계에는 포함                                                                                                                                                                                                                  |
| **EvidenceBundle**(파일 2곳)           | 실행마다 생성. **snippet 포함 원본**: `<DATA_DIR>/evidence/<슬러그>/<runId>.json`. **포인터만**: `posts/<슬러그>/evidence.json`. items[]: `{ analysisId?, commit, path, lineRange, snippet(DATA_DIR 쪽에만), date, note, source: linked \| discovered, redacted: bool }`                                                                                 |
| **VerificationReport**(파일)           | `posts/<슬러그>/verification.json`. claims[]: `{ text, kind: number \| path \| identifier \| statement, status: supported \| unsupported \| uncertain, evidenceRef? }` — 초안의 주장 문장만 담고 코드 조각은 없다                                                                                                                                        |

- **포인터 없는 분석 글은 저장하지 않는다.** 포인터는 `commit` 기준이라 HEAD가 바뀌어도 `git show <commit>:<path>`로 항상 같은 조각을 읽는다.
- 분석 글 원문·리포 경로는 본문 단계 입력 타입에 자리가 없다(타입으로 강제, BE11).
- `DATA_DIR`은 `.env`(로컬 절대경로 하드코딩 금지). 타임라인 조각 미리보기는 DATA_DIR 쪽을 읽는다.

## 리포 인덱싱 (워커가 수행)

- 진입: Phase 1-B는 **CLI** `pnpm --filter @galley/pipeline index <path> [--name] [--alias a,b] [--read-only] [--model <id>] [--full]` → Repo 생성(`indexing`) + IndexJob. Phase 2에 `/settings/repos`의 **폴더 추가·재인덱싱 Dialog**가 같은 일을 하며, 실행 Dialog와 **같은 모델 Select**로 인덱싱 모델을 고른다. 대시보드는 진행 상태만 폴링(run-location 원칙 — 워커에 신호 없음).
- **인덱싱 모델**: 기본값 = **Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)**. 레지스트리 상수 `indexingDefault` 한 곳(model-selection 원칙 — 앱·인덱서 코드에 id 없음). CLI `--model`·Dialog Select로 실행마다 바꿀 수 있다. 사용한 모델은 `IndexJob.modelId`와 `Repo.lastIndexModelId`에 기록하고 리포 행에 label로 표시. Anthropic 문서(2026-09-09 확인) 기준 $1/$5 per MTok, 컨텍스트 200K, **은퇴 2026-10-15 이전 없음** — 은퇴 공지 시 상수 한 줄 교체.
- **워커 동시 1개는 유지.** IndexJob과 Run은 같은 워커 루프가 집어간다. **Run 우선**, Run이 없을 때 IndexJob. 인덱싱 중 Run이 오면 현재 디렉터리 배치를 끝내고 Run으로 넘어간다(IndexJob은 디렉터리 단위로 진행 상태를 저장해 재개).
- 순서: 파일 트리 요약 → 주요 디렉터리별 `area` 분석 글 → `git log`를 기간(월)·경로로 묶어 `change` 분석 글 → `overview`.
- **모델 입력 상한(A 보수)**: 파일 1개 **16 KB** · 디렉터리당 **20개 / 총 160 KB** · 커밋 묶음당 **30개**. `packages/pipeline` 상수 `INDEX_LIMITS` 한 곳. 초과분은 파일명·커밋 메시지만으로 요약하고 `summaryOnly=true`. 부족하면 올린다.
- HEAD가 바뀌면 `stale`. 재인덱싱은 **바뀐 경로·새 커밋 범위만 증분**(`git diff --name-only <old>..<new>` → 해당 area 재생성, `git log <old>..<new>` → 새 change). 전체 재생성은 `--full`/별도 버튼.
- **읽기 전용 리포**(회사 리포 등)는 인덱스 생성만 하고 **어떤 쓰기도 하지 않는다**(파일·브랜치·git 상태 변경 금지. `git show`·`git log` 등 읽기 명령만).
- **식별 정보 필터**는 설정 파일 하나 **`.galley/redact.json`**(회사명·도메인·키·이메일·내부 URL 패턴)에 두고, **인덱싱(summary·pointers.note)·EvidenceBundle(snippet) 양쪽에서 같은 함수로** 적용한다. 통과 여부를 `redacted`에 기록.

## 주제 ↔ 분석 글 연결

- **파서 확장**: `주제_큐.md` 항목 끝 괄호 `(spacehome, react-router)` `(vendor manager, 2024.03)` `(spacehome + vendor manager)` `(2024.07)`에서 리포 이름·키워드·기간을 뽑는다. 리포 이름 매칭은 `Repo.name` + `Repo.aliases`. **괄호 형식은 그대로 두고 `주제_큐.md`를 고치지 않는다**(queue-sync-direction).
- **자동 연결**: 큐 적재 후 워커가 백그라운드로 "주제 키워드·기간 ↔ `RepoAnalysis.keywords`·`period`" 매칭으로 후보 분석 글을 붙인다. **모델 호출 없이 키워드·기간 매칭만**. 결과는 `TopicAnalysisLink(source=auto)`. 큐 행 보조 텍스트 "근거 n건".
- **수동 편집**: 큐 행 ⋮ → "근거 편집" Dialog — 연결 목록 보기·추가·제거, Dialog 안에서 리포 인덱스 검색. `source=manual`. 재적재(전체 리셋)에도 슬러그 키라 유지된다.
- **실행 Dialog**(BM6)에 같은 목록을 보여 마지막으로 조정. **연결 0건이면 경고(실행은 가능).**

## 파이프라인 단계 (5 → 6)

`근거 수집 → 벨로그 본문 → 근거 검증 → 링크드인 → Zenn → 발행정보·썸네일`

근거 검증을 본문 직후에 두는 이유: 링크드인·Zenn은 본문에서 파생되므로 **본문이 검증된 뒤** 만든다.

**근거 수집**

1. 연결된 분석 글의 `pointers`를 따라 원본에서 실제 조각을 읽는다(`git show <commit>:<path>` + 라인 범위) → `linked`.
2. 인덱스에서 주제 키워드·기간으로 추가 탐색해 연결에 없던 분석 글을 찾고 같은 방식으로 읽는다 → `discovered`. **선별 = 키워드 점수만**(겹침 수 + 기간 근접 가중, 모델 0회, 결정적). **상한 8개.** 재순위 훅 자리만 두고 모델 재순위는 Phase 2.
3. 식별 정보 필터 적용 → DATA_DIR에 snippet 포함 원본, posts에 포인터만 저장.

**벨로그 본문**: 입력 = 주제 + EvidenceBundle(요약 + 실제 조각) + 어투 프롬프트. **리포 전체·분석 글 원문은 넣지 않는다.**

**근거 검증**

- 주장 추출 = **정규식 + 모델**: 숫자·시간·파일 경로·식별자·백틱 코드는 **정규식**(결정적, 비용 0), "~했다" 사실 진술은 **모델**이 뽑는다.
- 대조: number/path/identifier는 EvidenceBundle의 snippet·path·note 문자열 대조(`supported`/`unsupported`). statement는 모델이 bundle만 보고 판정(`uncertain` 허용).
- `verification.json` 저장. **초안 본문은 수정하지 않는다**(수정은 사람 또는 수정 지시로).
- **unsupported가 있어도 단계는 성공**이며 다음 단계로 간다. 실패 조건이 아니라 **표시 조건**이다.

**링크드인·Zenn·발행정보**: 기존대로. 발행정보의 **근거 목록은 EvidenceBundle에서 생성**(커밋 해시·경로·날짜, 조각 없음) — `## 근거` 섹션 신설.

**재실행 규칙** (2026-09-12 교체 — 아래 "시작 단계 + 이후 전부" 한 규칙으로 통합)

재실행은 **시작 단계**를 하나 정하고, **그 단계와 파이프라인 순서상 뒤의 모든 단계**를 다시 돈다.

- **시작 단계 결정**: 사용자가 단계 Select로 지정하면 그 단계. 지정이 없으면 수정 지시 텍스트로 판단해 "근거"·"커밋"·"코드"가 있으면 **근거 수집**, 없으면 **벨로그 본문**.
- **이유**: 본문 단계의 입력은 EvidenceBundle뿐이고, 링크드인·Zenn은 본문에서 파생되며, 발행정보의 근거 목록도 EvidenceBundle에서 생성된다. 근거만 새로 모으고 본문을 두면 본문과 `evidence.json`이 어긋난 채 남고, 이후 검증에서 **옛 본문의 주장이 새 번들과 대조되어 unsupported가 대량 발생**한다.
- 기존 "본문 재실행 → 근거 검증 자동 재실행" 특례는 이 규칙에 흡수되므로 **삭제**한다.
- **비용이 커지므로 실행 전에 보여준다**: `planRerun`은 다시 돌 단계 목록을 반환하고, 재실행 확인 UI가 "다시 도는 단계: 근거 수집 → 본문 → 검증 → 링크드인 → Zenn → 발행정보"를 실행 전에 표시한다.

## 상태 머신(B1a) 인터페이스 요구사항

이 문서가 상태 머신에 요구하는 것. **2026-09-12 B1a는 🔒에서 해제**되어 pipeline 에이전트가 구현하고 사용자가 리뷰한다(decisions/core-modules.md 갱신 이력) — 이 절이 고정 스펙이므로 구현자가 전이 규칙을 새로 설계하지 않는다.

1. **단계 6개, 순서 고정**: `evidence → velog → verify → linkedin → zenn → publishInfo`. 순서 배열 하나가 단일 출처(타임라인·워커·재실행 규칙이 같은 배열을 읽는다).
2. **단계 결과에 표시용 플래그 자리**: 예 `flags?: { unsupported: number; uncertain: number }`. 플래그는 **전이에 영향 없음** — `verify`는 unsupported > 0이어도 `succeeded`.
3. **단계 결과 출처 = `fresh` | `carried`** (2026-09-12 교체 — `skipped` 삭제):
   - **`fresh`**: 이번 재실행에서 다시 돈 단계.
   - **`carried`**: 시작 단계보다 앞이라 이번 범위에 없던 단계. **이전 실행 결과를 그대로 사용한다.**
   - **첫 실행은 모든 단계가 `fresh`.**
   - "건너뜀" 문구는 쓰지 않는다 — 누락처럼 읽히지만 실제로는 **유효한 이전 결과**다.
4. **재실행 입력 = (시작 단계, 수정 지시 문자열)** → 출력은 **시작 단계와 그 뒤 전부**(위 "재실행 규칙"). 시작 단계는 Select 지정이 우선이고, 없으면 지시 텍스트에 "근거"·"커밋"·"코드"가 있으면 `evidence`, 없으면 `velog`. 반환된 단계 목록은 재실행 확인 UI가 실행 전에 보여준다.
5. **승인 게이트**: unsupported > 0이어도 승인 가능(표시만). 승인 전 공개 발행 금지는 그대로(publish-gate).
6. **실행 상태(queued/running/interrupted)와 분리**, 단계는 원자적(run-location) — 기존 요구사항 유지.

## 화면 반영 (decisions/layout.md §4 갱신)

- **실행 상세 /runs 타임라인 6줄.** 근거 수집 줄: 보조 "linked n · discovered n", 펼치면 EvidenceBundle 항목(경로·커밋·조각 미리보기 — DATA_DIR 쪽 읽음). 근거 검증 줄: 배지 "근거 없음 n · 불확실 n"(unsupported ≥ 1이면 주황), 펼치면 주장 목록 + 상태 + 근거 링크. **본문 미리보기 unsupported 밑줄은 Phase 2.**
- 좌측 목록 항목·홈 "지금 할 일" 행: 상태 배지 옆 작은 텍스트 "근거 없음 n".
- 큐 행: 보조 텍스트 "근거 n건". ⋮에 "근거 편집".
- **/settings/repos(Phase 2)**: 행 = 이름 · 경로 · 읽기 전용 배지 · 상태(ready/stale/indexing) · 분석 글 n · 마지막 인덱싱 · **인덱싱 모델 label** · `재인덱싱`. 상단 `폴더 추가`. 폴더 추가·재인덱싱 Dialog에 실행 Dialog와 같은 모델 Select. 인덱싱 중 진행률(디렉터리 n/m).

## Phase 배분

- **Phase 1-B**: 리포 인덱싱(CLI 트리거) · 주제 연결 · 근거 수집 · 근거 검증 · 타임라인 표시 · 근거 편집 Dialog. 본문 품질의 전제라 미루지 않는다.
- **Phase 2**: `/settings/repos` 화면(모델 Select Dialog 포함), 본문 밑줄, discovered 모델 재순위.
- 작업 단위·커밋은 todo/mvp-todo.md **BE1~BE14**.

## 이유

- 실행마다 리포 전체를 다시 읽으면 느리고 비싸다 → 캐시(인덱스) 필요.
- 그러나 모델이 한 번 압축한 요약만 입력하면 세부(숫자·함수명·순서)가 뭉개지고 모델이 빈칸을 그럴듯하게 메운다 → 원본 조각 필요.
- 주제 연결 시점에 붙인 분석 글이 글의 실제 범위와 다를 수 있다 → 실행 시 추가 탐색 + 검증 필요.
- 실제 예(`posts/pg-migration-toss-to-nicepay/`): 본문에 "스토어 약 50개·월 주문 1,000건", "2024-03-06 핫픽스", 커밋 메시지 `test nicepay`, 파일명 `payments/toss.ts` 같은 사실 주장이 인라인으로 박혀 있고 **발행정보에는 근거 목록이 없다.** 지금은 이 숫자·이름이 맞는지 사람이 기억으로 검수한다.
- snippet을 DATA_DIR에만 두는 이유: 회사 코드 조각이 blog 폴더 밖으로 나갈 경로를 원천 차단(blog 폴더는 발행 원고가 모이는 곳이라 실수로 옮겨질 위험이 가장 큼).

## 기각된 대안

- **실행마다 전체 리포 분석**: 비용·시간.
- **요약만 보고 작성**: 위 이유(세부 뭉개짐·환각).
- **근거 검증을 사람 검수에만 맡기기**: 검수 시간이 늘고 놓친다. 기계 대조 후 표시가 빠르다.
- **인덱싱 상한 B(32KB/40/60)·C(64KB/80/100)**: 디렉터리당 100k 토큰 이상, 비용 2.5배↑. A로 시작하고 부족하면 올린다.
- **인덱싱 모델 고정만 / 시작 시 Select만**: 고정 기본값 + CLI·Dialog 오버라이드가 둘의 장점을 합친다.
- **discovered 모델 재순위·임베딩**: 인덱스 규모가 작고(리포 수 개·분석 글 수백) 결정적 테스트가 우선. 임베딩은 라이브러리 추가.
- **주장 추출 정규식만 / 모델만**: 전자는 서술 주장을 못 뽑고, 후자는 숫자·경로를 누락할 수 있다.
- **본문 밑줄 지금**: B2e react-markdown 렌더에 하이라이트 주입은 별도 작업. 타임라인 펼침으로 충분.
- **alias를 `.galley/repos.json`에**: Repo 행(SQLite)과 2원화.
- **연결을 QueueItem 컬럼에 저장**: 전체 리셋 적재에 매번 지워진다.
- **연결을 `주제_큐.md` 괄호에 되쓰기**: 괄호 형식·파일을 건드리지 않기로 함.
- **snippet을 `posts/<슬러그>/evidence.json`에**: blog 폴더에 회사 코드 원문이 남는다.
- **읽기 전용 리포 인덱싱 제외**: 회사 실무 글(큐의 절반)에 근거를 못 붙여 목적 상실.

## ⚠️ 기존 결정과의 관계 (확인 완료)

1. **clean-room** — "회사 리포를 열지 않는다"는 Galley **개발**(에이전트) 규칙. Galley **런타임**이 회사 리포를 인덱싱하는 것은 사용자 본인 권한이며 별개. 코드 조각은 DATA_DIR에만, blog 폴더 밖 유출 경로 차단. 에이전트는 여전히 회사 리포를 열지 않는다(테스트는 tmpdir 픽스처 리포로만).
2. **INTENT.md** — 목표 항목을 6단계·7개 파일로 갱신(2026-09-09 사용자 승인).
3. **산출물 구조** — `evidence.json`(포인터)·`verification.json` 추가로 폴더당 7개. 발행정보에 `## 근거` 섹션 신설. B3a·B3c 완료조건 갱신.
4. **queue-sync-direction 전체 리셋 적재** — 연결은 슬러그 키 `TopicAnalysisLink`. 슬러그 파생(B1e 예정)을 BE6으로 앞당김.
5. **run-location 동시 1개** — IndexJob 동거, Run 우선.
6. **core-modules 🔒 상태 머신** — 위 "인터페이스 요구사항" 절.
7. **model-selection** — 인덱싱 모델도 레지스트리 id만. 기본값 상수 `indexingDefault`.

## 결정일

2026-09-09

## 갱신 이력

- 2026-09-09 초안 작성(원칙·데이터 모델·인덱싱·연결·6단계·화면·Phase 배분·충돌 6건·선택지 Q1~Q7).
- **2026-09-12 ⚠️ 재실행 규칙·단계 상태 교체**(요구사항 3·4): ⑴ 단계별 특례("근거 수집 기본 건너뜀" + "본문 → 검증 자동")를 **"시작 단계 + 이후 전부"** 한 규칙으로 대체. 근거만 새로 모으고 본문을 두면 본문과 evidence.json이 어긋나 검증에서 unsupported가 대량 발생한다. 비용이 커지므로 다시 돌 단계 목록을 실행 전에 UI로 보여준다. ⑵ `skipped` → **`fresh` | `carried`**. carried는 누락이 아니라 유효한 이전 결과이므로 "건너뜀"으로 쓰지 않는다. B1a 구현(PR #81)은 교체 전 요구사항을 정확히 따른 것이며, 구현 수정은 별도 작업으로 진행한다. decisions/layout.md 타임라인 표기·CLAUDE.md §2 한 줄도 함께 갱신.
- 2026-09-09 **확정**: 상한 A(16KB/20개·160KB/30개) · 인덱싱 모델 Haiku 4.5 기본 + CLI `--model`·Phase 2 Dialog Select + `Repo.lastIndexModelId` 표시 · discovered 키워드 점수만(상한 8) · 주장 추출 정규식+모델 · 본문 밑줄 Phase 2 · alias는 `Repo.aliases` · 연결은 `TopicAnalysisLink`(슬러그 키) · **snippet은 DATA_DIR에만, posts엔 포인터만** · INTENT 6단계·7개 파일 갱신. 상태 머신 인터페이스 요구사항 절 추가. Haiku id는 Anthropic 모델 문서에서 확인.
