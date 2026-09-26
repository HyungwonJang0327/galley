# 실행 모델: 재실행 = 새 Run · StepRunner 경계 · runOnce 루프

BW2(워커 루프) 착수 전에 정한 세 가지. 셋 다 "층을 늘리지 않는다 / 경계를 타입으로 막는다 / 비결정성을 밖으로 민다"는 같은 방향이다.

## 1. 재실행은 **새 Run**을 만든다

수정 지시로 다시 도는 것은 같은 Run 안의 재시도가 아니라 **새 Run**이다.

- **층을 늘리지 않는다**: 같은 Run에서 단계만 다시 돌면 이전 산출물과 diff하려고 "Run 안의 버전" 개념을 새로 만들게 되고, 결국 **Run → 시도 → 단계 3층**이 된다.
- **핵심 기록이 "몇 번 만에 승인됐는가"** 다. 승인 게이트가 제품의 중심인데 시도가 이력에 남지 않으면 그 기록이 사라진다.
- **비용**: 실행마다 모델·토큰·비용을 따로 남겨야 TopBar 비용 칩과 실행 이력이 맞는다. 한 Run에 누적하면 시도별 비용을 잃는다.
- **근거**: `evidence.json`·`verification.json`은 *그 시점 초안을 무엇과 대조했는지*의 기록이다. 덮어쓰면 근거 검증이라는 기능의 근거 자체가 사라진다.

**따라오는 것**

- **목록 묶기**: Run에 **`topicId`**(QueueItem id)와 **`attempt` 번호**를 둔다. 실행 이력·좌측 목록은 **주제 단위로 묶고 최신 Run을 대표로** 보여주며, 펼치면 시도들이 나온다. 레이아웃 스펙 §4-B 좌측 목록 구조를 그대로 쓴다.
- **`applyCommand` 확장**: 재실행 지시를 받으면 상태 전이만이 아니라 **"새 Run 생성" 지시와 `RerunPlan`을 함께** 돌려준다.
- **산출물 충돌**: 사람이 읽는 5개 파일(벨로그 본문·링크드인·Zenn·발행정보·썸네일)은 `posts/<슬러그>/` 루트에 **최신본만** 둔다(경로가 안정적이어야 하고 열어야 할 파일이 늘면 안 된다). ~~**Run별 부산물**(`evidence.json`·`verification.json`·단계 로그)은 `posts/<슬러그>/runs/<runId>/`에 남기고 **덮어쓰지 않는다.**~~ **⚠️ 결정 변경(2026-09-26 B3a, 사용자)**: `evidence.json`(포인터만)·`verification.json`도 **루트에 최신본**(폴더당 7개, INTENT·evidence-collection과 일치). Run별 이력은 posts가 아니라 **DATA_DIR**(`artifacts/<슬러그>/<runId>/`·`evidence/<슬러그>/<runId>.json`)이 맡는다 — blog 폴더에 Run 폴더를 늘리지 않는다.
- **posts는 승인 시 쓴다**(2026-09-26 B3a, 사용자 결정): 단계는 DATA_DIR에만 쓰고, 승인(`approveAndPublishRun`)이 그 Run의 산출물(carried면 출처 Run의 것)을 `posts/<슬러그>/`로 복사하면서 큐 파일 완료 이동·QueueItem 갱신·Run done을 한 번에 한다. posts에는 **승인본만** 남는다. 파일 이름은 blog 폴더의 기존 관례(`<제목>.md`·`<제목>_링크드인.md`·`<제목>_zenn.md`·`<제목>_발행정보.md`·`<제목>_썸네일.png`, 공백→`_`) + `evidence.json`·`verification.json`. 순서는 읽기·검증(부작용 없음) → posts 쓰기 → DB 트랜잭션(QueueItem을 완료 줄과 같은 제목·상태로 먼저, Run done, **그 안에서 마지막에** 큐 파일 쓰기 — 파일 쓰기 실패·롤백이면 DB가 되돌아간다) → 재적재(실패해도 승인은 성공). **덮어쓰기는 Galley가 쓴 폴더만** — DB에 이 주제의 승인된(done) Run이 같은 슬러그에 있을 때. 없는데 폴더가 있으면 `POSTS_DIR_EXISTS`(사람이 만든 폴더거나 앞선 승인이 posts를 쓴 뒤 실패한 잔여 — 문구가 옮기거나 지우라고 안내, 마커 파일을 두지 않는 대가). 알려진 한계: 승인 뒤 큐 제목이 `<글 제목> (posts/<슬러그>)`가 되어 줄을 대기로 되돌려 재실행하면 `topicSlug`가 힌트까지 포함해 다른 슬러그를 만든다(리뷰 M3 — 슬러그 파생 규칙은 별도 결정) · 재승인 시 글 제목이 바뀌면 옛 이름 파일이 남는다(L2). **썸네일**(2026-09-26 B3b, 사용자 결정): 발행정보 단계가 같은 모델 호출에서 받은 부제(40자)·라벨(영문 대문자 한 단어, 없으면 설정 기본)과 `.galley/thumbnail.json`의 푸터로 `thumbnail.png`(1200×630 배율 2)를 DATA_DIR 이진 산출물로 만들고, 승인이 `<제목>_썸네일.png`로 복사한다 — 7개 완성. **썸네일 실패 = 단계 실패**(Chrome 없음·실행 실패는 재시도 불가, 제한 시간은 재시도). 단계는 모델을 부르기 전에 `ThumbnailRenderer.check()`로 Chrome 유무를 보아 토큰을 아낀다. macOS Chrome headless는 스크린샷 뒤 프로세스가 60초 넘게 남아 종료 대신 **출력 PNG 완성(IEND) 폴링 후 SIGKILL**(실측 0.5s). 이진 산출물은 `StepResult.artifacts`(문자열)에 넣지 않는다 — DATA_DIR 파일이 진실.
- BE14a의 `origin`/`sourceRunId`와 BE14c는 이 결정과 맞는다 — 되돌릴 것 없다.
- **carried 행은 재실행 Run을 만드는 시점에 함께 만든다**(2026-09-13, BE14c). `startRerun({ previousRunId, plan, instruction, modelId? })`가 새 Run과 단계 행 6개를 **한 트랜잭션**에서 만든다 — 앞은 `carried`+`succeeded`+`sourceRunId`(`resolveCarriedSources`를 같은 트랜잭션에서 불러 승계 사슬이 일관), 시작 단계부터는 `pending`+`fresh`. **워커는 첫 실행과 똑같이 pending만 잡고 "재실행"이라는 개념을 모른다** — §2 "워커는 오케스트레이션만"을 지키는 가장 큰 이유다. 확인 UI가 보여준 `planRerun` 결과와 실제 행이 같은 계산에서 나온다(두 번 계산하지 않는다). 가드: 직전 Run이 실행 중이면 거부(안 끝난 단계를 "이전 결과"로 가져오게 된다) — 재실행은 승인 대기·실패·완료에서만. 이어받을 단계가 직전 Run에서 성공하지 않았어도 거부(실패한 Run은 실패 단계부터만). 직전 Run의 검수 상태는 건드리지 않는다 — 종결은 승인 게이트 배선(BW4)의 몫. **기각**: _워커가 잡을 때 채우기_ — 워커가 재실행을 인지해야 하고 계획을 UI와 워커가 두 번 계산한다.
- **수정 지시를 받은 Run의 종결 상태 = `revised`**(2026-09-13, BW4, 사용자 결정). `RUN_STATUS`에 다섯 번째 값. 승인(`done`)과 구분해야 "몇 번 만에 승인됐는가"가 남고, 종결이라 `finishedAt`을 채운다. `applyCommand`의 `status`는 **명령을 받은 그 Run**의 다음 상태(revise → `revised`)이고 `rerun`이 새 Run 생성 지시다. `revised`에는 다시 명령이 통하지 않는다. **재실행은 그 주제의 최신 시도에서만** 갈라진다(`NOT_LATEST_ATTEMPT`) — 사슬이 두 갈래가 되지 않게. 이 가드 덕에 "같은 주제의 다른 Run이 실행 중"(`RUN_ALREADY_ACTIVE`)은 재실행에서 도달 불가라 뺐다(첫 실행 `startRun`에는 남아 있다). **기각**: _`pendingApproval` 유지 + `finishedAt`만_ — 카운트·필터가 finishedAt까지 봐야 한다 / _`done`_ — 승인과 구분이 안 된다.
- **승인·수정 지시의 표면은 두 경로**(2026-09-13): `POST /api/runs/[id]/approve` · `POST /api/runs/[id]/revise`. 한 경로 `{ type }`보다 본문 검증·상태 매핑이 단순하다. `reviseRun`은 이 Run 종결과 `startRerunIn`(새 Run)을 **한 트랜잭션**으로 — 새 Run이 못 생기면 이 Run도 승인 대기로 남는다. 확인 Dialog용 미리보기 `POST /api/runs/[id]/rerun-plan`은 `reviseRun`과 **같은 `planRerun`·`resolveCarriedSources`**를 부르며 일치를 테스트로 고정한다. 수정 지시 상한 `INSTRUCTION_MAX_LENGTH`(2000자) — 이 길이는 URL 쿼리에 안전하지 않아 미리보기도 POST.
- **`Run.instruction`·`Run.startStep`**(2026-09-13). instruction은 사용자 입력 원문 그대로(정규화하지 않음), startStep은 `planRerun`이 정한 최종 결과. 첫 실행은 둘 다 null. 지시를 안 남기면 Run이 "왜 여기서부터 다시 돌았는지"를 설명 못 한다 — 시도 이력의 핵심 정보다. startStep은 fresh 첫 행에서 유도할 수 있지만 이력·타임라인 헤더에서 매번 유도하는 것보다 적는 게 싸다. 흐름: `startRerun`이 저장 → 워커가 `ClaimedRun`에서 읽어 `StepContext.instruction`으로 넘긴다(carried 단계는 돌지 않으니 받지 않는다). **기각**: _BW4로 미루기_ — 마이그레이션 한 번 더, 그 사이 `StepContext.instruction` 경로가 한 번도 안 돈 채 남는다.

**기각**: _같은 Run에서 단계만 재실행_ — 버전 개념이 별도로 필요해져 층만 늘어난다.

**주제 키 = `topicId`** (2026-09-12 확정). 슬러그는 내용 파생이라 제목·URL 슬러그가 바뀌면 이전 Run이 고아가 되고 `attempt`가 1부터 다시 시작하며 `sourceRunId` 승계 사슬이 끊긴다 — **식별자는 내용에서 파생되지 않아야 한다.** `Run { id, topicId, topicSlug, attempt, … }`이고 `topicSlug`는 키가 아니라 **그 실행이 어느 폴더에 썼는지의 사실 기록**이다.

이를 위해 **`QueueItem.id`를 안정적으로 만드는 것이 선행**이다(decisions/queue-sync-direction.md 2026-09-12 변경): 적재를 전체 리셋 → **줄 텍스트 매칭 upsert**로, 파일에서 사라진 줄은 **삭제하지 않고 상태만** 바꾼다(Run이 붙어 있을 수 있다).

## 2. 워커는 오케스트레이션만, 단계 내용은 `StepRunner` 뒤에

```ts
interface StepRunner { run(ctx: StepContext): Promise<StepResult> }
StepContext { runId, step, topic, evidence?, instruction?, signal: AbortSignal }
StepResult  { artifacts, tokens, cost, model? }
```

- **모든 단계가 모델 호출인 것이 아니다**: 썸네일은 headless Chrome 스크린샷(~~`make_thumb.py` 실행~~, 2026-09-26 B3b)이고 발행정보는 상당 부분 EvidenceBundle 조립이다. 워커에 모델 호출을 박으면 이 단계들이 예외가 되고 경계가 무너진다.
- BE8~BE11이 미착수라, 워커가 직접 모델을 부르면 **존재하지 않는 입력을 상대로 짓는 셈**이고 BE가 오면 워커를 다시 고친다.
- **비싸다**: 실행은 월 1–2회 상위 모델이다. Mock `StepRunner`가 있으면 워커의 어려운 부분(클레임·순서·heartbeat·재시도·비용 기록)을 **토큰 없이 CI에서 반복 검증**할 수 있다.
- 모델을 어댑터로 교체 가능하게 한 기존 결정(model-selection)과 같은 원칙을 한 층 위에 적용한 것이다.

**규칙**

- `tokens`·`cost`·`model`은 **StepRunner가 돌려주고 워커는 기록만** 한다. 단계마다 모델이 다르거나 아예 없을 수 있으므로 워커가 추정하지 않는다(`model`은 optional — 썸네일 단계는 없다).
- **취소·타임아웃은 워커가 소유**하고 `signal`로 전달한다.
- 실패는 **재시도 가능 여부를 에러 타입으로** StepRunner가 알리고, **재시도 정책은 워커**가 정한다. 근거 검증의 `unsupported`는 실패가 아니라 표시 조건이므로 **실패 경로로 보내지 않는다.**
- **경계 강제**: 워커 쪽 코드는 모델 레지스트리·SDK를 **import하지 않는다**(타입과 의존성으로 막는다). `StepRunner` 구현은 워커가 아니라 `packages/pipeline`의 단계 모듈 쪽에 두고 BE8~BE11이 하나씩 채운다.
- Mock `StepRunner`는 단계마다 **결정적인 픽스처 산출물**을 돌려준다.
- **라우팅은 `createStepRunner(deps)` 하나**(2026-09-26 BS5): 단계명 → evidence·velog·verify·linkedin·zenn·publishInfo 구현으로 분기하고 모르는 단계명은 프로그래머 오류(throw). 조립 루트(`bin/worker.ts`)만 스토어(DATA_DIR)·레지스트리·어투 폴더를 만들어 넘긴다. **발행정보는 B3a 전까지 Mock 위임**(`deps.publishInfo` 자리, 사용자 결정).
- **Mock 러너 조건은 `NODE_ENV`**(2026-09-26 사용자 결정): `test`(스모크·CI)·`development`(모델 없이 화면 확인)면 Mock, 값이 없으면 실제. Mock 어댑터가 development에만 노출되는 것(model-selection)과 같은 축이다. 조합:

  | 대시보드 (`pnpm dev` = development) | 워커 `NODE_ENV`     | 결과                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
  | ----------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | development                         | 없음(`pnpm worker`) | 화면은 Mock 어댑터가 목록에 보이지만 실행은 **실제 모델**. 로컬 실사용 조합.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
  | development                         | development         | 워커도 Mock 러너 — 토큰 없이 **승인까지** 화면 흐름 확인(2026-09-27 M4). `mock` 모델을 골라도 실제로는 픽스처. DATA_DIR이 규칙에 맞으면 Mock이 실제 형식의 산출물·번들·1×1 PNG를 DATA_DIR에 쓰므로 미리보기·승인이 된다. **주의: 승인 결과(posts 7개·큐 완료 줄)는 가짜 근거(커밋 `0…1`/`0…2`, `src/mock/*`)·Mock 본문이라 실제 발행에 쓰지 않는다** — 승인은 `주제_큐.md`를 실제로 바꾼다. DATA_DIR이 없으면 예전처럼 안 쓰는 Mock(승인은 `ARTIFACT_MISSING`), 규칙에 안 맞으면(상대경로·BLOG_DIR 안) error 로그 뒤 같은 폴백(사용자 결정). |
  | any                                 | test                | 워커 스모크·CI 전용.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

- **기동 검증**(2026-09-26 BS5): 실모드 워커는 `DATA_DIR`이 비었거나·상대경로거나·`BLOG_DIR` 안이면(BE8 ⑩), `PROMPTS_DIR`이 상대경로면(BS1 ⑦) 기동하지 않는다. **`~`는 확장하지 않는다** — Node `--env-file`은 셸이 아니라 `~/x`가 리포 안 `~` 폴더가 되므로 안내에 절대경로만 적는다(사용자 결정, PROMPTS_DIR과 같은 규칙). 기동 로그에 `availableModels`(키 있는 어댑터 id)를 남겨 키가 빠진 채 띄운 것을 실행 실패 전에 알 수 있게 한다.

**BW2 완료 조건**: 큐 적재 → 실행 → 승인 대기 → 승인까지가 **토큰 없이 CI에서 한 번에** 돈다.

**기각**: _워커가 모델을 직접 호출_ — 모든 단계를 모델 호출로 가정하게 되고 BE 착수 시 워커 재작업.

## 3. 루프는 `runOnce(deps)`, `bin/worker.ts`는 껍데기

- `runOnce`는 **순수 함수가 아니다**(DB를 건드린다). 목표는 순수성이 아니라 **비결정성을 전부 `deps`로 미는 것**이다: `{ clock, repo, stepRunner, ids, logger }`.
- `runOnce` 안에서 `Date.now()`·`setTimeout`·`randomUUID`를 직접 부르지 않는다 — `clock`·`ids`를 통해서만. 그래야 **heartbeat 만료·타임아웃을 실제 시간을 흘리지 않고** 테스트한다.
- **한 tick = 한 단계만** 처리한다. 여러 단계를 이어 물지 않는다 — 그래야 승인 게이트·취소·heartbeat가 tick 사이에 끼어들고, 테스트도 단계 단위로 본다.
- `runOnce`는 **무엇을 했는지 돌려준다**: `{ outcome: 'idle' | 'claimed' | 'completed' | 'failed' | 'recovered', stepRef? }`. 테스트가 DB를 뒤지지 않고 반환값으로 1차 검증하고, 껍데기는 이 값으로 대기 간격을 정한다(`idle`이면 2초, 진행했으면 즉시 한 번 더).
- **껍데기의 책임은 타이머·시그널·종료뿐**. `SIGTERM`을 받으면 진행 중 tick의 `AbortSignal`을 끊고 **클레임한 RunStep을 반환한 뒤** 종료한다.
- **반환(`released`)은 실패가 아니다**(2026-09-13, BW3, 사용자 결정). 종료 신호로 끊긴 단계는 `StepRunner.discard`로 쓰다 만 산출물을 버리고 `pending`으로 되돌린다 — **시도 횟수에 세지 않는다**(finishStep을 부르지 않는다). 실행은 `interrupted`·`workerId` 없음으로 돌아가 다음 기동이 30초 heartbeat 공백을 기다리지 않고 바로 잡는다. 구현이 `signal.reason` 대신 자기 에러를 던져도 종료 중이면 반환이다. 종료 중이면 새 시도·새 클레임을 시작하지 않는다. (전에는 취소가 `ABORTED`/`STEP_FAILED`로 흘러 3번 재시도 뒤 실행이 `failed`가 됐다.)
- **타이머도 deps**(`timers.every`·`timers.after`, 2026-09-13). 단계 도중 heartbeat(5s)와 단계 타임아웃(10분)이 여기서 나온다 — 테스트는 손으로 발화시키는 가짜 타이머로 실제 시간 없이 검증한다. 상세는 decisions/run-location.md "중단·재개".
- **재시도 사이에 기다린다**(2026-09-26 BS5, 사용자 결정): `RETRY_DELAYS_MS = [10s, 20s]`(n번째 실패 뒤 n번째 값, 넘치면 마지막). 즉시 재호출하면 429·5xx가 어댑터 SDK 재시도(`maxRetries` 1, model-selection)까지 곱해져 몰린다(BS2 리뷰 ⑭). 대기는 `timers.after`이고 종료 신호에 바로 깨어나 단계를 반환한다. 대기 중에도 runStep의 heartbeat 타이머가 돌므로 대기 길이는 30초 공백과 무관하다(테스트로 단언). 테스트 `drive()`는 가짜 일회 타이머를 손으로 넘겨 틱을 끝까지 돌리며, 시도가 열린 blockingRunner와는 같이 쓰지 않는다(단계 타임아웃까지 발화).
- **실모델 스모크 1개**(`src/steps/liveModel.smoke.test.ts`, 2026-09-26): `GALLEY_LIVE_SMOKE=1`일 때만 실제 레지스트리 + 합성 번들로 벨로그 단계를 한 번 돌려 토큰·비용을 출력한다. 기본 모델은 가장 싼 Haiku(배선 확인이 목적, 사용자 결정), 상위 모델은 `GALLEY_LIVE_MODEL`. CI는 켜지 않는다.

**테스트**: tick을 직접 여러 번 불러 상태 변화를 본다. 최소 4가지 — ⑴ 대기 주제 1건 → claim → 완료 → 다음 단계 claim 순서 ⑵ 승인 대기에서는 여러 번 불러도 아무것도 claim하지 않음 ⑶ heartbeat 만료된 claim을 다음 tick이 회수(**clock을 앞으로 돌려** 검증) ⑷ 재시도 가능 에러는 재시도, 영구 실패는 실패로 기록하고 멈춤.
**프로세스 스모크 1개**는 남긴다 — 실제 프로세스를 띄워 `SIGTERM`에 깨끗이 종료되는지만. **CI 기본 스위트가 아니라 별도 잡**으로 분리하고 타이밍 의존 단언은 넣지 않는다. (2026-09-13 구현: `bin/worker.smoke.test.ts` · `pnpm --filter @galley/pipeline test:smoke` · CI `smoke` 잡. **required check로 두되 한 번이라도 흔들리면 즉시 informational로 내린다** — 종료 코드와 로그 한 줄만 단언하는 테스트는 결정적이어야 정상이고, 흔들리면 테스트가 아니라 워커 종료 경로에 버그가 있는 것이다. 사용자 결정.)

**기각**: _프로세스를 통째로 띄워 테스트_ — 느리고 타이밍에 불안정해 CI에서 깜빡거린다(스모크 1개로 축소).

## 결정일

2026-09-12

## 갱신 이력

- 2026-09-27 B3a M4: **Mock 러너가 DATA_DIR에 산출물·번들을 쓴다**(`createMockStepRunner({ stores, clock })`, 실제 단계 렌더러·상수 재사용, 제목 힌트 제거·`(기존 글)` 거부·저장 실패는 `MOCK_STORE_WRITE_FAILED`). 워커 Mock 분기는 `resolveDataDir` ok면 스토어 주입, DATA_DIR 없음은 info 폴백, 오설정은 error 로그 + 폴백(사용자 결정 — 실모드로 바꾸면 기동 거부될 설정을 미리 보게). §2 조합표 development/development 행 갱신 + 가짜 근거 주의. 승인 통합 테스트(Mock 6단계 → posts 7개·완료 줄).
- 2026-09-26 B2e: 대시보드 산출물 미리보기는 DATA_DIR `artifacts/<슬러그>/<runId>/`를 **서버 컴포넌트가 직접 읽는다**(GET API 없음, carried는 `sourceRunId` — 승인과 같은 규칙). 이진(썸네일)만 `GET /api/runs/[id]/thumbnail`. ~~Mock 모드는 DATA_DIR에 안 쓰므로 미리보기가 "산출물 없음"~~ → 2026-09-27 M4부터 DATA_DIR이 있으면 Mock도 쓴다(§2 조합표). decisions/navigation.md 갱신 이력.
- 2026-09-26 B3b: §1 썸네일(같은 모델 호출의 부제·라벨, thumbnail.json 푸터, 실패=단계 실패, check() 사전 점검, IEND 폴링), §2 썸네일은 Chrome 스크린샷. 사용자 결정 4건(Node headless Chrome·JSON 합침·실패=단계 실패·사전 점검).
- 2026-09-26 B3a: §1 **결정 변경** — `evidence.json`·`verification.json`도 posts 루트(폴더당 7개), Run별 이력은 DATA_DIR. posts는 승인 시 쓴다(절차·덮어쓰기 규칙·알려진 한계). §2 조합표에 Mock 모드 승인 불가. 사용자 결정 4건(승인 시 복사·기존 관례 파일명+루트 7개·Galley 폴더만 덮어씀·소개/태그 모델 1회) + 리뷰 4건(M1 파일 쓰기 트랜잭션 안·M2 analyses 제외·M3 기록·M4 문서).
- 2026-09-26 BS5: §2에 라우팅 `createStepRunner`·Mock 러너 조건(NODE_ENV)·대시보드/워커 조합표·기동 검증(DATA_DIR·PROMPTS_DIR 절대경로, `~` 불가, availableModels 로그), §3에 재시도 대기 10s·20s·실모델 스모크. 사용자 결정 5건(발행정보 Mock 위임·NODE_ENV 조건·maxRetries 1+대기·`~` 확장 안 함·스모크 기본 Haiku).
- 2026-09-13 BW3: §3에 반환(`released`)은 실패가 아님 · 타이머 deps · 스모크 잡 운영 규칙(required, 흔들리면 informational).
- 2026-09-13 BW4: `revised` 상태 · 최신 시도에서만 재실행 · 승인/수정 지시 두 경로 + POST 미리보기. §1 "따라오는 것"에 추가.
- 2026-09-13 BE14c: carried 행 생성 시점 = `startRerun`(재실행 Run 생성 시, 한 트랜잭션) + `Run.instruction`·`startStep` 컬럼. §1 "따라오는 것"에 추가.
- 2026-09-12 최초 결정(BW2 착수 전 3건). decisions/run-location.md(워커 위치·heartbeat)와 evidence-collection.md(재실행 규칙·단계 출처)를 전제로 한 실행 모델 층이다.
