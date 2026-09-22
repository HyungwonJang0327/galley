# 근거 수집 구조: 리포 인덱스 캐시 + 원본 조각 + 근거 검증

## 결정

**캐시는 "어디를 볼지"를 찾는 용도, "무엇이 쓰여 있는지"는 항상 원본 파일에서 읽는다.**

- 서비스 시작(리포 연결) 시 지정 폴더의 리포를 한 번 훑어 **리포 인덱스**(분석 글 묶음)를 만들고 SQLite에 캐시한다.
- 주제를 큐에 넣을 때 관련 **분석 글**(인덱스 항목)을 주제에 연결해 저장한다.
- 글을 쓸 때는 연결된 분석 글을 **우선** 보되, 분석 글이 가리키는 **원본 코드 조각을 그 시점에 파일에서 읽어** 함께 입력한다. **요약만으로 본문을 쓰지 않는다.**
- 본문 뒤에 **근거 검증** 단계를 두어 초안의 코드 조각·숫자·파일명·함수명이 EvidenceBundle에 있는지 대조한다.
- **회사 코드 조각은 `~/Desktop/blog` 밖으로 나가지 않는다.** snippet은 Galley 데이터 폴더(`DATA_DIR`)에만 저장하고, `posts/<슬러그>/`에는 포인터만 둔다.

## 데이터 모델 (packages/pipeline, Prisma)

| 모델                                   | 필드                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Repo**                               | id · path · name · **aliases(JSON)** · readOnly(bool) · headSha · lastIndexedAt · **lastIndexModelId** · status(`indexing`/`ready`/`stale`/`error`)                                                                                                                                                                                                                                                                                                                                  |
| **RepoAnalysis**(분석 글, 인덱스 단위) | repoId · kind(`overview` 리포 전체 / `area` 디렉터리·기능 영역 / `change` 커밋 묶음·기간별 변경) · **key**(안정 식별 키, `(repoId, key)` unique — 증분 재인덱싱이 upsert로 id를 유지해 manual 연결이 살아남는다, 2026-09-21) · title · summary(모델 생성, 한국어) · keywords[] · **pointers[] ≥ 1**(`{ commit, path, lineStart?, lineEnd?, note }`) · period?(change의 기간) · summaryOnly(입력 상한 초과로 파일명·커밋 메시지만 본 경우) · modelId·inputTokens·outputTokens·costUsd |
| **QueueItem 추가**                     | repoNames[] · keywords[] · period? — `주제_큐.md` 괄호 힌트에서 **파서가 채움**(재적재 시 재생성)                                                                                                                                                                                                                                                                                                                                                                                    |
| **TopicAnalysisLink**(주제↔분석 글)    | **topicId(QueueItem.id)** · analysisId · source(`auto` 키워드 매칭 / `manual` 사용자 편집) · updatedAt(auto→manual 승격 시각) — ~~슬러그 키~~ **QueueItem.id 키**(2026-09-21 결정 변경, 갱신 이력)                                                                                                                                                                                                                                                                                   |
| **IndexJob**                           | repoId · 종류(full/incremental) · modelId · 상태 · 진행(디렉터리 n/m + **progressCursor** 마지막 배치 키, 재개 지점) · 토큰·비용 — Run과 **별도 테이블**, TopBar 비용 칩 합계에는 포함                                                                                                                                                                                                                                                                                               |
| **EvidenceBundle**(파일 2곳)           | 실행마다 생성. **snippet 포함 원본**: `<DATA_DIR>/evidence/<슬러그>/<runId>.json`. **포인터만**: `posts/<슬러그>/evidence.json`. items[]: `{ analysisId?, commit, path, lineRange, snippet(DATA_DIR 쪽에만), date, note, source: linked \| discovered, redacted: bool }`                                                                                                                                                                                                             |
| **VerificationReport**(파일)           | `posts/<슬러그>/verification.json`. claims[]: `{ text, kind: number \| path \| identifier \| statement, status: supported \| unsupported \| uncertain, evidenceRef? }` — 초안의 주장 문장만 담고 코드 조각은 없다                                                                                                                                                                                                                                                                    |

- **포인터 없는 분석 글은 저장하지 않는다.** 포인터는 `commit` 기준이라 HEAD가 바뀌어도 `git show <commit>:<path>`로 항상 같은 조각을 읽는다.
- 분석 글 원문·리포 경로는 본문 단계 입력 타입에 자리가 없다(타입으로 강제, BE11).
- `DATA_DIR`은 `.env`(로컬 절대경로 하드코딩 금지). 타임라인 조각 미리보기는 DATA_DIR 쪽을 읽는다.

## 리포 인덱싱 (워커가 수행)

- 진입: Phase 1-B는 **CLI** `pnpm --filter @galley/pipeline index <path> [--name] [--alias a,b] [--read-only] [--model <id>] [--full]` → Repo 생성(`indexing`) + IndexJob. Phase 2에 `/settings/repos`의 **폴더 추가·재인덱싱 Dialog**가 같은 일을 하며, 실행 Dialog와 **같은 모델 Select**로 인덱싱 모델을 고른다. 대시보드는 진행 상태만 폴링(run-location 원칙 — 워커에 신호 없음).
- **인덱싱 모델**: 기본값 = **Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)**. 레지스트리 상수 `indexingDefault` 한 곳(model-selection 원칙 — 앱·인덱서 코드에 id 없음). CLI `--model`·Dialog Select로 실행마다 바꿀 수 있다. 사용한 모델은 `IndexJob.modelId`와 `Repo.lastIndexModelId`에 기록하고 리포 행에 label로 표시. Anthropic 문서(2026-09-09 확인) 기준 $1/$5 per MTok, 컨텍스트 200K, **은퇴 2026-10-15 이전 없음** — 은퇴 공지 시 상수 한 줄 교체.
- **워커 동시 1개는 유지.** IndexJob과 Run은 같은 워커 루프가 집어간다. **Run 우선**, Run이 없을 때 IndexJob. 인덱싱 중 Run이 오면 현재 디렉터리 배치를 끝내고 Run으로 넘어간다(IndexJob은 디렉터리 단위로 진행 상태를 저장해 재개).
- 순서: 파일 트리 요약 → 주요 디렉터리별 `area` 분석 글 → `git log`를 기간(월)·경로로 묶어 `change` 분석 글 → `overview`.
- **모델 입력 상한(A 보수)**: 파일 1개 **16 KB** · 디렉터리당 **20개 / 총 160 KB** · 커밋 묶음당 **30개**. `packages/pipeline` 상수 `INDEX_LIMITS` 한 곳. 초과분은 파일명·커밋 메시지만으로 요약하고 `summaryOnly=true`. 부족하면 올린다.
- HEAD가 바뀌면 `stale` — 판정은 워커가 폴링하지 않고 **작업을 만드는 시점**(CLI `index <path>`·Phase 2 Dialog → `enqueueIndexJob`)에 HEAD와 `Repo.headSha`를 비교해 한다(2026-09-22 BE5). 재인덱싱은 **바뀐 경로·새 커밋 범위만 증분**(`git diff --name-only <old>..<new>` → 해당 area 재생성, `git log <old>..<new>` → 새 change). 전체 재생성은 `--full`/별도 버튼. change는 **새 커밋이 닿은 달 전체**를 다시 읽고 그 달의 기존 `change:<월>*` 행을 지운 뒤 저장한다(묶음 키가 입력 커밋 수에 따라 갈리므로 — 2026-09-22 BE4 리뷰 M2, 실행자 BE5 몫).
- **읽기 전용 리포**(회사 리포 등)는 인덱스 생성만 하고 **어떤 쓰기도 하지 않는다**(파일·브랜치·git 상태 변경 금지. `git show`·`git log` 등 읽기 명령만).
- **식별 정보 필터**는 설정 파일 하나 **`.galley/redact.json`**(회사명·도메인·키·이메일·내부 URL 패턴)에 두고, **인덱싱(summary·pointers.note)·EvidenceBundle(snippet) 양쪽에서 같은 함수로** 적용한다. 통과 여부를 `redacted`에 기록. 필터는 **저장되는 텍스트**에 건다 — 모델 입력(파일 본문·커밋 메시지)은 redact하지 않는다(원문을 봐야 요약이 정확하고, 모델 API는 이미 비밀 취급 경계 밖이 아니다). 대신 입력에서 **식별 정보 밀도가 높은 조각은 아예 뺀다**: `INDEX_IGNORE`의 비밀값 파일과 커밋 본문의 트레일러 문단(`Signed-off-by`·`Co-authored-by`·이슈 URL, 2026-09-22 BE4).

## 주제 ↔ 분석 글 연결

- **파서 확장**: `주제_큐.md` 항목 끝 괄호 `(spacehome, react-router)` `(vendor manager, 2024.03)` `(spacehome + vendor manager)` `(2024.07)`에서 리포 이름·키워드·기간을 뽑는다. 리포 이름 매칭은 `Repo.name` + `Repo.aliases`. **괄호 형식은 그대로 두고 `주제_큐.md`를 고치지 않는다**(queue-sync-direction). 구현(2026-09-22 BE6): 파일 파서(`queueFile.ts`)는 불변이고 제목은 힌트까지 원문 그대로 저장, 추출은 **파일 → DB 경계(`parsedQueueToRows`)** 에서 — 제목의 **모든 괄호 묶음**(반각·전각, `normalizeTopicTitle`이 매칭에서 빼는 것과 같은 범위)을 힌트로 보고, 쉼표(반각·전각)·`+`·`→`·`·`로 항을 나눈다(하이픈·공백·슬래시는 항의 일부 — 2026-09-22 BE6 리뷰로 `/` 제외). 연·연.월·범위(`2024` `2024.03` `2024.07~2024.09`, 구분자 `.`·`-` — `/`는 항의 일부라 `2024/12`는 키워드)는 `period`(첫 것, **정규형** `YYYY`·`YYYY-MM`·`YYYY-MM~YYYY-MM`), 나머지 항은 등록된 리포 이름·alias(대소문자·NFC 무시)에 맞으면 `repoNames`(정식 이름), 아니면 소문자 `keywords`. 리포를 나중에 등록하면 다음 적재가 다시 가른다(컬럼은 재적재 시 재생성). `(Toss → NicePay)` 같은 메모도 키워드가 되지만 매칭에 안 걸릴 뿐 해가 없다.
- **자동 연결**: 큐 적재 후 워커가 백그라운드로 "주제 키워드·기간 ↔ `RepoAnalysis.keywords`·`period`" 매칭으로 후보 분석 글을 붙인다. **모델 호출 없이 키워드·기간 매칭만**. 결과는 `TopicAnalysisLink(source=auto)`. 큐 행 보조 텍스트 "근거 n건". 구현(2026-09-22 BE7): 워커 틱(`runAutoLinkTick`)이 **Run·IndexJob이 없을 때** `QueueItem.autoLinkedAt`이 없거나 힌트 재적재(`updatedAt`)·리포 재인덱싱(`Repo.lastIndexedAt`)보다 오래된 주제만 골라 `topicsPerTick`(20)개씩 다시 계산한다 — 대시보드는 신호를 보내지 않고 컬럼 상태로만 알린다. 규칙(`matchTopic`, 순수): `repoNames`가 있으면 그 리포의 글만 · 키워드 겹침(정확히 같은 토큰, 양쪽 NFC·소문자, 숫자·기호·1글자 잡음 제외) 하나당 1점 · change 글의 달이 주제 기간 안이면 1점(기간 정규형을 달 집합으로 전개: 연 → 12달, 뒤집힌 범위 바로잡음, `maxMonths` 36) · **리포만 적은 주제는 그 리포의 `overview`만**(리포 글 전부를 붙이지 않는다) · 힌트가 없으면 아무것도 안 붙인다 · 점수 내림차순 → kind(overview·area·change) → key 순으로 `maxPerTopic`(12)까지. 동기화: auto는 계산 결과와 같게 추가·삭제, **manual은 절대 손대지 않는다**(계산 결과에 있는 글이 manual이면 그대로, 강등 없음). 상한은 `src/link/limits.ts` 한 곳.
- **수동 편집**: 큐 행 ⋮ → "근거 편집" Dialog — 연결 목록 보기·추가·제거, Dialog 안에서 리포 인덱스 검색. `source=manual`. 재적재(전체 리셋)에도 슬러그 키라 유지된다.
- **실행 Dialog**(BM6)에 같은 목록을 보여 마지막으로 조정. **연결 0건이면 경고(실행은 가능).**

## 파이프라인 단계 (5 → 6)

`근거 수집 → 벨로그 본문 → 근거 검증 → 링크드인 → Zenn → 발행정보·썸네일`

근거 검증을 본문 직후에 두는 이유: 링크드인·Zenn은 본문에서 파생되므로 **본문이 검증된 뒤** 만든다.

**근거 수집**

1. 연결된 분석 글의 `pointers`를 따라 원본에서 실제 조각을 읽는다(`git show <commit>:<path>` + 라인 범위) → `linked`.
2. 인덱스에서 주제 키워드·기간으로 추가 탐색해 연결에 없던 분석 글을 찾고 같은 방식으로 읽는다 → `discovered`. **선별 = 키워드 점수만**(겹침 수 + 기간 근접 가중, 모델 0회, 결정적). **상한 8개.** 재순위 훅 자리만 두고 모델 재순위는 Phase 2.
3. 식별 정보 필터 적용 → DATA_DIR에 snippet 포함 원본, posts에 포인터만 저장. 구현(2026-09-22 BE8): `createEvidenceStepRunner`(evidence 단계만 아는 StepRunner, 라우팅은 BS5)가 `EvidenceStore`(DATA_DIR, `.env DATA_DIR`)에 번들을 쓰고 워커에는 `artifacts['evidence.json']`으로 **포인터 사본(`stripSnippets`)만** 돌려준다 — posts 폴더에는 B3a가 쓴다. 포인터 순서는 **manual 연결 → auto 연결**(사람이 고른 근거가 상한 안에 먼저), 같은 조각(커밋·경로·라인)은 한 번만, 상한 `maxLinked` 40. 못 읽은 포인터(커밋·경로 없음·바이너리)는 `unreadable`로 세고 실패가 아니다. 연결이 없으면 빈 번들(0건 경고는 UI). **readOnly 리포의 포인터가 있는데 필터 설정이 없으면 단계 실패**(`EVIDENCE_REDACT_CONFIG_REQUIRED`, 재시도 불가). 종료 신호로 반환되면 `discard`가 DATA_DIR 파일을 지운다.

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
   - **출처 승계**: `carried`의 `sourceRunId`는 **직전 Run이 아니라 그 결과를 실제로 생산한 Run**이다. 직전 Run의 그 단계 행이 `fresh`면 직전 Run의 id를, `carried`면 그 행의 `sourceRunId`를 **그대로 승계**한다. 승계하지 않으면 재실행을 반복할수록 출처가 한 칸씩 밀려 타임라인의 "이전 결과 · {원래 실행 시각}"이 실제 생산 시점과 어긋난다.
   - 계산 위치: 범위(`fresh`/`carried`)는 순수 함수 `planRerun`, **출처(`sourceRunId`)는 이전 Run의 기록을 읽어야 하므로 리포지토리**(`resolveCarriedSources`). 재실행 확인 API 하나가 둘을 조합해 UI에 넘긴다.
4. **재실행 입력 = (시작 단계?, 수정 지시 문자열)** → 출력은 `{ startStep, fresh, carried }`. `fresh`는 시작 단계와 그 뒤 전부, `carried`는 그 앞부분(둘 다 파이프라인 순서, 이어 붙이면 6단계 전부). 시작 단계는 Select 지정이 우선이고, 없으면 지시 텍스트에 "근거"·"커밋"·"코드"가 있으면 `evidence`, 없으면 `velog`. **`carried`까지 상태 머신이 함께 돌려준다** — 확인 UI가 "다시 도는 단계"와 "이전 결과 유지"를 둘 다 보여줘야 하고, 호출부가 시작 인덱스를 다시 다룰 일이 없게 출처를 하나로 둔다. `evidence`가 시작이면 `carried`가 비고 `publishInfo`만 돌면 `fresh`가 하나인데, 둘 다 규칙의 자연스러운 결과라 분기하지 않는다(UI는 `carried`가 비면 그 섹션을 숨긴다). **첫 실행에는 태우지 않는다.**
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
- 2026-09-12 재실행 규칙 구현(BE14a·BE14b): 요구사항 3에 **출처 승계 규칙**(carried의 sourceRunId는 직전 Run이 아니라 실제 생산 Run — 반복 재실행에서 한 칸씩 밀리는 것 방지)과 계산 위치(범위는 순수 함수, 출처는 리포지토리)를, 요구사항 4에 `planRerun` 반환 형태(`{ startStep, fresh, carried }`)를 적었다.
- **2026-09-12 ⚠️ 재실행 규칙·단계 상태 교체**(요구사항 3·4): ⑴ 단계별 특례("근거 수집 기본 건너뜀" + "본문 → 검증 자동")를 **"시작 단계 + 이후 전부"** 한 규칙으로 대체. 근거만 새로 모으고 본문을 두면 본문과 evidence.json이 어긋나 검증에서 unsupported가 대량 발생한다. 비용이 커지므로 다시 돌 단계 목록을 실행 전에 UI로 보여준다. ⑵ `skipped` → **`fresh` | `carried`**. carried는 누락이 아니라 유효한 이전 결과이므로 "건너뜀"으로 쓰지 않는다. B1a 구현(PR #81)은 교체 전 요구사항을 정확히 따른 것이며, 구현 수정은 별도 작업으로 진행한다. decisions/layout.md 타임라인 표기·CLAUDE.md §2 한 줄도 함께 갱신.
- 2026-09-09 **확정**: 상한 A(16KB/20개·160KB/30개) · 인덱싱 모델 Haiku 4.5 기본 + CLI `--model`·Phase 2 Dialog Select + `Repo.lastIndexModelId` 표시 · discovered 키워드 점수만(상한 8) · 주장 추출 정규식+모델 · 본문 밑줄 Phase 2 · alias는 `Repo.aliases` · 연결은 `TopicAnalysisLink`(슬러그 키) · **snippet은 DATA_DIR에만, posts엔 포인터만** · INTENT 6단계·7개 파일 갱신. 상태 머신 인터페이스 요구사항 절 추가. Haiku id는 Anthropic 모델 문서에서 확인.
- 2026-09-21 BE1 구현 리뷰(reviewer)로 **결정 변경 1건**: TopicAnalysisLink 키를 `topicSlug` → **`topicId`(QueueItem.id, FK)**. 이유 — 원 근거("전체 리셋 적재에도 살아남는다")는 2026-09-12 queue-sync-direction 변경(매칭 upsert, id 안정 키, "주제를 가리키는 새 코드는 topicId")으로 사라졌고, 슬러그는 괄호 힌트까지 포함한 제목에서 파생돼 힌트만 고쳐도 연결이 고아가 된다. 같은 리뷰로 추가: RepoAnalysis `key`(`(repoId, key)` unique, 증분 재인덱싱 upsert용) · IndexJob `progressCursor`(재개 지점) · TopicAnalysisLink `updatedAt` · 포인터 빈 배열은 `serializePointers`가 값으로 거부. 사용자 승인(추천대로).
- 2026-09-21 BE2: `.galley/redact.json`의 **실제 파일은 gitignore**(회사명·도메인 패턴 = 회사 식별 정보, 공개 리포에 두지 않는다 — clean-room) · 예시 `.galley/redact.example.json`만 커밋. 형식 `{ version: 1, rules: [literal | regex] }`, **순서가 의미**(넓은 패턴 → 회사명). 설정이 없으면 로더가 `REDACT_CONFIG_MISSING`을 값으로 돌려주고 인덱서(BE3)가 readOnly 리포에서 필터 없이 진행할지 거부할지 정한다. **깨진 설정(`REDACT_CONFIG_INVALID`·`UNREADABLE`)이면 무조건 거부** — 인덱싱·근거 수집을 시작하지 않는다(일부 규칙만 적용된 채 진행하는 것은 필터 없음보다 나쁘다). 실패 값은 코드 + 열거 `reason` + 위치(`ruleId`·`index`)만, 문장은 로그 층. 경로는 `.env` `REDACT_CONFIG_PATH`(선택) → 없으면 리포 루트 파생. **`redacted`의 뜻 정정**: 함수 결과의 `redacted`는 "치환이 일어났는가"이고, "필터를 거쳤는가"는 저장 쪽(RepoAnalysis·EvidenceBundle)이 `filtered`로 따로 기록한다(BE3·BE8) — 둘을 합치면 "필터 없이 진행"과 "거쳤지만 적중 0"을 구분할 수 없다. 규칙 순서 실수는 로더가 일반적으로 잡을 수 없다 — 치환 토큰 충돌만 기계 검사(`REPLACEMENT_COLLISION`), 자체 검증용 `checks` 필드는 후속 후보.
- 2026-09-22 BE3 리포 인덱서 1 구현에서 정한 것: ① **영역(area) = 최상위 디렉터리**, 파일이 `filesPerArea`를 넘고 하위 디렉터리가 있으면 한 단계 아래로 재귀 분할(모노레포 `packages/*`가 각자 영역), 루트 파일은 `area:.` · key 형식 `area:<dir>`(`overview`·`change:<YYYY-MM>[:<path>]`는 BE4) ② `INDEX_IGNORE`(node_modules·dist·락파일·바이너리 확장자)는 모델에 보내지 않음 ③ 상한 안 선택은 소스 확장자 우선·작은 파일 우선 ④ 모델 출력은 JSON(title·summary·keywords·pointers) — 포인터는 **실제로 읽은** 파일만 인정하고 라인은 파일 줄 수 안으로(시작이 넘으면 버림·끝이 넘으면 clamp), 유효한 포인터가 없으면 읽은 파일 전체를, 읽은 파일도 없으면(전부 상한 초과) 계획의 파일 전체를 라인 없는 포인터로 삼아 summaryOnly 글을 남긴다(≥ 1 보장). **출력이 깨진 영역**은 건너뛰고 기록(`skipped`, 과금은 합산) — **모델 호출 실패**(키·네트워크·429, `MODEL_FAILED`)는 다른 종류라 즉시 중단·실패 반환(전 영역 skipped인 ready 리포가 남지 않게). 저장되는 텍스트(title·summary·keywords·note) 전부 redact ⑤ **readOnly 리포 + redact 설정 없음(MISSING) → 거부**(`REDACT_CONFIG_REQUIRED`), readOnly 아니면 진행하되 `filtered=false` 저장 — RepoAnalysis에 `filtered`·`redacted` 컬럼 추가(마이그레이션 `repo_analysis_filtered`) ⑥ git은 `rev-parse`·`ls-tree`·`show`만(`LC_ALL=C` 고정 — 한국어 로케일 메시지로 판별이 깨졌음) ⑦ JSON 컬럼 쓰기는 `upsertRepoAnalysis` 한 곳 ⑧ **Repo 상태·headSha는 인덱서가 쓰지 않는다** — IndexJob 실행자(BE5)가 성공·실패 모두 한 곳에서 기록(IndexJob failed ↔ Repo error), 인덱서는 headSha·수치를 report로 돌려준다 ⑨ report·IndexJob·로그에는 **경로·디렉터리명을 넣지 않는다**(수치만) — `describeTree` 문자열은 CLI 화면 전용 ⑩ 재개: `skipKeys`(끝난 영역 키)로 이미 끝난 영역은 모델을 부르지 않는다, `onAreaDone`이 `status·analysisId·usage`를 넘겨 실행자가 `progressCursor`를 쓴다 ⑪ `INDEX_IGNORE`에 비밀값 파일(.env 계열·키·인증서·자격 증명)을 포함 — redact 설정과 무관하게 모델로 보내지 않는다 · 심볼릭 링크·NUL 포함 바이너리도 제외 ⑫ git 인자는 `--end-of-options` + 커밋 해시 형식 검증(옵션 주입으로 파일이 쓰이는 것을 막는다), `ls-tree --full-tree`, `GIT_DIR` 등 환경 변수 제거. IndexJob 실행·진행 저장·CLI는 BE5. 사라진 영역의 고아 행 정리는 BE5(증분).
- 2026-09-22 BE4 리포 인덱서 2 구현에서 정한 것: ① **change 묶음 = 작성 월**(author date, 작성자 로컬 오프셋 기준 `YYYY-MM` — 리베이스로 바뀌는 커밋일이 아니라 작업한 날), key `change:<YYYY-MM>`. 한 달이 `commitsPerBatch`(30)를 넘으면 커밋의 **주 디렉터리**(가장 많이 손댄 최상위 디렉터리)로 나눠 `change:<YYYY-MM>:<dir>`. 그래도 넘으면 앞쪽만 상세(본문·파일 목록), 나머지는 제목만 → `summaryOnly` ② `git log`는 `-z --no-merges --no-renames --raw`(읽기만) — 병합 커밋은 빼고, 이름 바꿈은 A+D로 풀어 **경로가 항상 커밋에 실존**, 서브모듈(160000)·심볼릭 링크(120000)는 `gitListFiles`와 같은 기준으로 제외. **`rev-list`의 sha 목록으로 레코드를 대조**해 커밋 본문에 구분자가 있어도 가짜 커밋이 생기지 않게 한다(리뷰 H1) ③ **diff는 모델에 보내지 않는다** — 커밋 메시지·변경 파일 목록(상태 A/M/D/T)만. 포인터는 `{ commit, path }`(라인 없음 — 본문을 읽지 않았으니 검증 불가), **삭제 파일은 첫 부모 커밋 기준**(삭제 뒤엔 열 수 없다). 유효한 포인터가 없으면 상세 커밋마다 그 커밋에 살아 있는 파일 하나 ④ **overview**(key `overview`)는 저장된 area·change 글의 제목·요약·키워드를 입력으로(원본 파일 안 읽음). 입력 상한 `overviewSources`(120, area 전부 + 최근 change 순, 자르면 summaryOnly). 포인터는 모델이 출처로 고른 글의 **첫 포인터를 물려받는다**(저장 시 검증된 값), 없으면 area 전부. area·change 글이 하나도 없으면 `NO_SOURCES` ⑤ 상한 추가: `maxCommits` 2000(최신부터, 넘으면 report `truncated`), `commitBodyChars` 400, `filesPerCommit` 40, `OUTPUT_LIMITS.pointersPerChange/Overview`·`maxOutputTokens` — 전부 `limits.ts` 한 곳 ⑥ **IndexJob 토큰·비용 기록은 BE5 실행자**(todo BE4 문구 "IndexJob에 기록"은 결정 ⑧과 맞춰 정정) — 인덱서는 report(usage·costUsd)만 돌려준다 ⑦ report `skipped`는 **수치**(BE3 `IndexAreasReport.skipped`도 함께 — 키에 디렉터리명이 있어 ⑨ 위반이었다). 키는 `onAreaDone`/`onBatchDone` 콜백으로만 ⑧ 모델 입력은 redact하지 않되 커밋 본문의 **트레일러 문단은 뺀다**(위 "식별 정보 필터" 줄) ⑨ 증분(fromSha)에서 같은 달을 일부만 읽으면 묶음 분할이 달라져 덮어쓰기·중복이 생긴다 → **BE5 실행자가 달 단위로 다시 읽고 그 달 행을 지운 뒤 저장**(위 "증분" 줄, 리뷰 M2 선택지 ① — 키 형식 유지, 작은 리포의 글이 쪼개지지 않는다). 기록만(BE5 또는 다음 결정): 한 달 분할이 디렉터리 수만큼 잘게 쪼개지는 문제(M3 — 작은 그룹 합치기 또는 청크 분할), overview 출력 불량 시 옛 행 잔존(L7), 작성일 오프셋이 다른 커밋의 사전순 정렬(L4), `.gitmodules`를 `INDEX_IGNORE`에(L11), 커밋 본문 프롬프트 주입(L9), 서로게이트 절단(L10).
- 2026-09-22 BE5 IndexJob 실행자·증분·CLI 구현에서 정한 것: ① **한 틱 = 배치 하나**(영역 하나·변경 묶음 하나·개요) — Run 워커 `runOnce`와 같은 모양이라 "Run 우선·인덱싱 중 Run이 오면 현재 배치를 끝내고 넘어간다"가 저절로 된다(runOnce는 Run이 없을 때만 `indexer.tick`). heartbeat 30s 공백 → interrupted 회수·5s 박동, 종료 신호는 배치 뒤 반환(released), 예상 밖 예외는 `INDEX_UNEXPECTED`로 작업 실패 ② 재개 지점 `progressCursor` = `<단계>:<마지막으로 끝낸 키>`(`areas:`·`changes:`·`overview:`), 인덱서는 `resumeAfterKey`+`maxBatches:1`로 그 다음 하나만 돈다. `progressTotal`은 단계를 계획할 때마다 늘어난다(영역 n → +변경 m → +개요 1) ③ **IndexJob·Repo 상태 쓰기는 `indexJobRepo.ts` 한 곳**(결정 ⑧ 이행): 잡으면 Repo `indexing`, 배치마다 커서·진행·토큰·비용 합산, 끝은 IndexJob done ↔ Repo ready(`headSha`·`lastIndexedAt`·`lastIndexModelId`) / failed ↔ error를 한 트랜잭션. **작업은 잡을 때 고정한 커밋(`IndexJob.toSha`, enqueue가 채우고 없으면 클레임 틱이 HEAD로) 기준**으로 모든 배치·diff를 읽고 `Repo.headSha = toSha`로 끝낸다 — 틱 사이에 HEAD가 움직여도 영역이 섞이지 않고, 작업 중 들어온 커밋은 다음 `enqueue`가 증분으로 잡는다(리뷰 H2). 클레임 뒤의 모든 IndexJob 쓰기는 `{ id, workerId, running }` 조건이라 회수돼 남의 것이 된 작업에는 옛 워커의 늦은 진행·완료·실패가 닿지 않는다(실행자는 `lost`로 손을 뗀다, 리뷰 M1) ④ **증분**: 영역은 `git diff --name-only <fromSha> <HEAD>` 경로 → `areaKeyForPath`(가장 긴 디렉터리 접두)로 다시 만들 영역만, 변경은 새 커밋이 닿은 달만(BE4 ⑨ — 이력은 처음부터 다시 계획), 개요는 매 작업 다시. unchanged는 **저장된 글이 있는 키만**(분할이 바뀌어 행이 없는 키는 만든다, 리뷰 M2). 각 단계가 끝나면 인덱서의 `plannedKeys` 밖 행을 `pruneAnalyses`로 지운다(사라진 영역·달 분할이 바뀐 옛 묶음, 연결은 FK cascade) ⑤ **CLI는 등록+큐잉만**(`enqueueIndexJob` — Phase 2 Dialog와 공유), 실행은 워커. 처음이면 full, HEAD가 같으면 작업 없음, 다르면 incremental(`fromSha`=옛 HEAD, Repo `stale`), `--full` 또는 `error` 리포는 full. 활성 작업 중복(`INDEX_JOB_ACTIVE`)·이름 충돌(`REPO_NAME_TAKEN`)·git 아님은 값으로 거부(실패면 리포도 바꾸지 않는다 — 검사가 쓰기보다 앞, 나머지는 한 트랜잭션). `--read-only`는 **있을 때만 true를 넘긴다** — 플래그가 없다고 readOnly 리포를 false로 되돌리지 않는다(필터 필수 가드, 리뷰 H1). stale은 HEAD가 달라졌을 때만. 모델은 레지스트리 id만(기본 `indexingDefault`, `available:false`면 거부), readOnly는 필터 설정을 사전 검사 ⑥ 워커는 기동 시 레지스트리와 필터 설정을 한 번 읽는다 — 없으면(MISSING) null로 기동(readOnly 작업은 `REDACT_CONFIG_REQUIRED`로 실패), **깨졌으면(INVALID·UNREADABLE) 기동하지 않는다**(BE2 결정, CLI도 exit 2 — 리뷰 M4). 레지스트리 import는 **조립 루트 `bin/worker.ts`만**(run-execution-model "워커 쪽 코드는 레지스트리·SDK를 import하지 않는다"의 예외 — `runOnce`·`runIndexTick`은 어댑터 조회 인터페이스만 받는다, 리뷰 L11). 예상 밖 예외 코드는 `INDEX_TICK_FAILED` ⑦ `.gitmodules`를 `INDEX_IGNORE`에(BE4 L11). 기록만: 월 분할이 잘게 쪼개지는 문제(BE4 M3), 개요 출력 불량 시 옛 개요 행 유지(L7 — 실패가 아니라 이전 개요가 남는다), 작성일 오프셋 정렬(L4)·프롬프트 주입(L9)·서로게이트(L10), BE5 리뷰의 커서 키가 계획에 없을 때 처음부터(L1)·틱마다 재계획 비용(L2, 커밋 고정으로 인메모리 캐시 가능)·Run 도는 동안 자기 IndexJob heartbeat 만료로 자기 회수(L3, 워커 1개면 틱 두 개 낭비)·틱 시작 시 abort면 반환 없이 idle(L4, Run과 동일)·Run 쪽 `finishStep`도 소유 조건 없음(M1 기록).
- 2026-09-22 BE6 괄호 힌트 파서에서 정한 것: ① **파일 파서 불변·추출은 적재 경계** — 제목은 원문 그대로 DB에, 힌트는 `QueueItem.repoNames`·`keywords`·`period` 컬럼(재적재 시 재생성). 라운드트립(A4c)은 그대로 통과 ② 힌트 범위 = 제목의 모든 괄호 묶음(끝 괄호만이 아니라 — `normalizeTopicTitle`과 같은 범위라 "힌트만 고치면 같은 항목" 규칙과 일치) ③ 항 구분자 `,` `，` `+` `→` `·`(**`/`는 항의 일부** — 경로·버전·A/B 표기, 리뷰 1), 기간 형식 연(19xx·20xx)·연.월(1~~12)·범위(첫 것만), **저장은 정규형** `YYYY`·`YYYY-MM`·`YYYY-MM~YYYY-MM`(⚠️ 결정 변경: 처음엔 원문이었으나 같은 뜻이 여러 표기로 갈려 BE7이 다시 파싱해야 했다 — 리뷰 2, 사용자 승인). 범위 전개·방향 뒤집힘 해석은 매칭 쪽. 리포/키워드 판별은 **적재 시점의 Repo 목록**(`resolveTopicHints`, 생성 순 — alias가 겹치면 먼저 등록한 리포, 유일성 검사는 리포 등록 쪽 몫) — 파서는 리포를 모른다 ④ 등록된 리포가 없으면 전부 키워드(BE7 자동 연결은 키워드·기간만으로도 돈다) ⑤ 기간이 둘이면 둘째는 버린다 — 실제 큐에 그런 줄이 없다고 사용자가 확인(2026-09-22), 여러 달은 범위로 적는다. 기록만(BE7): 본문 괄호의 잡음 키워드(`React(18)` → `18`)는 매칭에서 1~~2글자·숫자·기호만인 키워드를 거른다 · 인덱서 키워드와 주제 키워드 비교는 양쪽 NFC 명시 · 전각 숫자·영문은 NFC로 안 접힘(현행 유지 — `normalizeTopicTitle`과 같이 바꾸면 매칭 키가 갈라진다) · 사라진 줄을 보류로 내릴 때 힌트 컬럼은 남긴다(제목이 남으니 정합).
- 2026-09-22 BE7 자동 연결 구현에서 정한 것: ① **트리거는 컬럼 상태** — `QueueItem.autoLinkedAt`(마이그레이션 `queue_item_auto_linked_at`) vs `updatedAt`·`Repo.lastIndexedAt` 비교, 워커가 Run·IndexJob 다음 순서로 틱마다 `topicsPerTick`개(별도 잡 테이블 없음 — 모델 호출이 없어 재시도·비용 기록이 필요 없다) ② 매칭은 위 "자동 연결" 규칙(키워드 정확 일치 + 기간 달 일치 + 리포 좁힘, 리포만이면 overview) — 부분 일치·요약 본문 검색은 하지 않는다(결정적·설명 가능, "근거 편집" Dialog가 이유(`keyword`·`period`·`repo`)를 보여줄 수 있게 `matchedKeywords`·`reasons`를 돌려준다) ③ **manual 불변**: auto 계산은 manual 행을 만들지도 지우지도 강등하지도 않는다. 재적재는 연결 테이블을 건드리지 않으므로(키가 `QueueItem.id`) manual이 살아남는다(테스트) ④ 힌트가 하나도 없는 주제는 auto 연결 0(잘못 붙은 것을 남기지 않는다) ⑤ 로그는 수치만(주제 제목·키워드는 사람이 쓴 글). ⑥ **동기화는 한 트랜잭션 + `updatedAt` 조건부**(리뷰 H1): 힌트·기존 연결 읽기와 쓰기를 한 트랜잭션에서, 마지막에 `updatedAt`이 읽은 값 그대로일 때만 `autoLinkedAt`을 기록하고(적재 시각 `updatedAt`은 건드리지 않는다) 그 사이 적재가 끼어들었으면 롤백(`TOPIC_CHANGED`) — 다음 틱이 새 힌트로 다시. unique·FK 경합은 `LINK_CONFLICT`로 그 주제만 건너뛴다 ⑦ 큐 적재는 **내용이 같은 줄을 update하지 않는다**(리뷰 M1) — `updatedAt`이 "내용이 바뀐 시각"이라 힌트가 바뀐 주제만 다시 계산된다 ⑧ 자동 연결 틱 뒤 워커는 쉰다(급하지 않은 가장 싼 일, 시계 역행 tight loop 방지) ⑨ 기간이 `maxMonths`(36)를 넘으면 **최근 달부터** 그만큼(오래된 달을 버린다) ⑩ 재계산 대상은 상태 무관 전 주제(완료·보류 포함 — 이력 표시에 연결이 필요할 수 있다, 리포 재인덱싱마다 전부 도는 비용은 허용) ⑪ ⚠️ **BE12 착수 전 결정(리뷰 H2)**: 사람이 auto 연결을 "제거"하면 다음 재계산이 되살리므로, `TopicAnalysisLink.source`에 **`dismissed`**(사람이 뗀 auto — 계산 결과에 있어도 안 붙이고 목록엔 안 보임)를 추가한다. 자동 연결은 `desired`에서 manual·dismissed를 뺀다. "추가"가 이미 auto인 글이면 create가 아니라 **source 갱신(auto → manual 승격)**. 구현은 BE12(스키마 어휘 `LINK_SOURCE`에 값 추가 + 마이그레이션 없음 — 문자열 컬럼). 기록만: 연결 이유(`reasons`·`matchedKeywords`)는 DB에 없고 Dialog가 `matchTopic`으로 재계산해 보인다(재인덱싱 뒤 어긋날 수 있음 — 필요하면 `TopicAnalysisLink.reason` JSON 컬럼, 리뷰 M4) · 링커 틱의 예상 밖 예외는 워커 루프 catch에 기댄다(L9) · idle 틱마다 전 주제 3컬럼을 읽어 JS로 거른다(L6, 수백까지 무의미) · 리포 삭제 시 분석 글 cascade로 연결도 사라진다.
- 2026-09-22 BE8 근거 수집 단계 1 구현에서 정한 것: ① **번들 파일 2곳의 경계는 타입으로** — `EvidenceItem`(snippet 있음, DATA_DIR)과 `EvidencePointerItem`(snippet 키 없음, posts)이 다른 타입이고 `stripSnippets`만이 사본을 만든다. `parseEvidenceBundle`은 snippet 없는 파일을 거부한다(뒤 단계가 포인터 사본을 원본으로 착각하지 않게) ② `EvidenceStore`는 DATA_DIR 전용 인터페이스(`write`·`read`·`remove`, 원자적 쓰기, 슬러그·runId의 경로 구분자는 파일 이름으로만) — blog 폴더로 가는 메서드가 없다 ③ 조각 읽기 규칙: 라인 없는 포인터는 파일 앞 `snippetLines`(200)줄, 끝이 파일을 넘으면 clamp, 시작이 넘으면 1부터(포인터가 낡아도 파일은 보여준다), 줄·바이트(16KB, 문자 경계) 상한을 넘기면 `truncated` ④ 항목 `date` = 그 커밋의 작성일(`git log -1 --format=%aI`, 읽기만) — 발행정보 `## 근거` 목록에 쓴다 ⑤ 단계는 모델을 쓰지 않으므로 `tokens`·`model`을 비운다(워커가 추정하지 않는다) ⑥ 상한은 `src/evidence/limits.ts` 한 곳. discovered(추가 탐색)는 BE9, 뒤 단계가 번들을 읽는 자리(`StepContext.evidence`)는 BE11.
