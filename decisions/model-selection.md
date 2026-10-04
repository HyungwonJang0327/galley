# 실행별 모델 선택 (모델은 Run 속성)

## 결정

모델은 전역 설정이 아니라 **실행(Run) 단위 속성**이다. 실행을 시작할 때 고르고, `Run.modelId`에 기록되고, 재실행 시 그 단계만 바꿀 수 있다.

- 어댑터 계층은 `@galley/pipeline`에 둔다: `ModelAdapter` 인터페이스(🔒 직접 작성 핵심 모듈 b — decisions/core-modules.md) + `ModelRegistry` + 구체 어댑터. **멀티 provider**(`anthropic` + `openai`) — 유저가 실행 시 Claude·GPT를 함께 고른다.
- 파이프라인 단계 코드는 **어댑터 id만** 받고 provider를 모른다. `costUsd`는 어댑터가 계산하고 파이프라인은 합산만 한다.
- `Settings.defaultModelId` 하나 = 실행 Dialog 초기값. **SQLite settings 테이블**에 저장. 바꾸는 곳은 **설정 > 모델·비용**(`/settings/model`) 하나(2026-10-04 결정 변경 — 이전엔 TopBar 칩 표시값 겸 칩 클릭으로 변경).
  - 저장 형태(2026-10-04 BM5): 키-값 테이블 `Setting { key @id, value, updatedAt }`, 키는 `SETTING_KEY`(pipeline `src/settings/settings.ts`) 한 곳. 읽기 `getDefaultModel` — 저장값이 없거나 **레지스트리에 없는 id**면 `registry.default()`로 폴백, 키 없는 모델(`available:false`)은 폴백하지 않는다(사람이 고른 값 — 실행 시작이 `MODEL_UNAVAILABLE`로 알린다). 쓰기 `setDefaultModelId`는 레지스트리에 없으면 `UNKNOWN_MODEL` 값 반환. `startRun`은 modelId가 없으면 이 값을 쓴다. 대시보드는 셸(AppFrame, 서버)이 label만 읽어 TopBar에 props로 넘기고, 조회 실패 시 레지스트리 기본 label(던지지 않음).

## 어댑터 계층 (packages/pipeline)

- **ModelAdapter**(요구사항 — 인터페이스 파일은 🔒 사용자 작성, AI는 초안·나머지 배선·테스트): `id`(예 `anthropic:claude-opus-5`)·`label`·`provider`·가격(입력·출력 백만 토큰당 USD)·`available`(API 키 설정 여부) / `generate(input) → { text, usage:{ inputTokens, outputTokens }, costUsd, durationMs }`. **스트리밍은 Phase 1에 안 함** — 인터페이스에 자리만 남기지 않고 필요할 때 추가(YAGNI).
- **ModelRegistry**: `list()` / `get(id)` / `default()`. API 키 없는 provider의 어댑터는 목록에 남되 `available:false`(UI 비활성 + 툴팁 "API 키 없음 (.env ANTHROPIC_API_KEY / OPENAI_API_KEY)"). **레지스트리 정의 = `packages/pipeline` 코드 상수** — 어댑터 추가 = 파일 하나 + 등록 한 줄. 어댑터 provider 로직이 어차피 코드라 json 외부화 이득이 적다(YAGNI). 단가·레지스트리 외부화는 Phase 2.
- **SDK 의존성 2개**: `@anthropic-ai/sdk` + `openai`. 라이브러리 추가 결정은 이 문서로 갈음(설치·버전 핀은 BM3에서). provider 타입 `'anthropic' | 'openai' | 'mock'`.
- **SDK 재시도는 레지스트리가 정한다**(2026-09-26 BS5, 사용자 결정): 어댑터 옵션 `maxRetries`를 `ADAPTER_MAX_RETRIES = 1`로 넘긴다(SDK 기본 2). 단계 재시도(워커 3회 + 대기 10s·20s, run-execution-model §3)와 곱해지므로 어댑터 쪽은 짧게 — 429가 최대 9회 몰리던 것을 막는다. 앱·단계 코드는 이 값을 모른다.
- **가격표**: 어댑터별 상수로 시작. 비용 = usage × 단가를 **어댑터 안에서** 계산. 가격이 바뀌면 코드 수정으로 대응(Anthropic은 가격 API가 없어 자동화 이득도 없음). provider API 가격 조회는 Phase 2 검토 항목.
- **첫 구현(2026-09-09 확정)**: Claude 4개 + GPT 3개 + Mock. id·단가는 각 provider 문서에서 확인(아래 표). Mock 어댑터(고정 텍스트·비용 0, 테스트·데모용)는 프로덕션 레지스트리에 `NODE_ENV=development`에서만 노출. 기본 모델(`default()`)은 Claude Opus 5.

  | provider  | id                          | label            | 입력 $/MTok | 출력 $/MTok |
  | --------- | --------------------------- | ---------------- | ----------- | ----------- |
  | anthropic | `claude-fable-5-1`          | Claude Fable 5.1 | 10          | 50          |
  | anthropic | `claude-opus-5`             | Claude Opus 5    | 5           | 25          |
  | anthropic | `claude-sonnet-5`           | Claude Sonnet 5  | 2           | 10          |
  | anthropic | `claude-haiku-4-5-20251001` | Claude Haiku 4.5 | 1           | 5           |
  | openai    | `gpt-5.5`                   | GPT-5.5          | 5           | 30          |
  | openai    | `gpt-5.1`                   | GPT-5.1          | 1.25        | 10          |
  | openai    | `gpt-5-mini`                | GPT-5 mini       | 0.25        | 2           |

  단가는 백만 토큰당(어댑터 안에서 `× tokens / 1_000_000`). 가격 변동 시 코드 수정.

## 데이터 모델

- `Run.modelId`(필수) — 실행 시작 시 선택한 어댑터 id.
- `RunStep`마다 `modelId`·`inputTokens`·`outputTokens`·`costUsd`·`durationMs`. **Phase 1은 모든 단계 modelId = Run.modelId.** 단계별 오버라이드는 Phase 2에 **이 컬럼만으로** 붙는다(스키마가 지금부터 막지 않음).
- `Run.totalCostUsd`는 **저장하지 않고 단계 합산으로 계산**(파생값 미저장 원칙). 이력 목록이 느리면 그때 캐시 컬럼을 검토.
- **재실행**(수정 지시 → 해당 단계만): 기본값 = 원래 `Run.modelId`. 다른 모델을 고르면 그 `RunStep.modelId`만 바뀌고 `Run.modelId`는 유지 → "본문만 상위 모델로 다시" 같은 사용이 자연스럽다.

## 화면 (decisions/layout·navigation과 연동)

- **실행 시작 Dialog**(galley-ui Dialog): "지금 실행"이 눌리는 모든 진입점 — 큐 행 ⋮ · 큐 상단 `맨 위 실행` · 홈 "다음 실행" 카드 — 에서 **같은 Dialog**를 연다. 제목=주제명. 모델 Select(label + provider 보조 텍스트 + 우측 입력/출력 단가 회색 텍스트, `available:false`는 비활성 + 툴팁). 초기값 = `Settings.defaultModelId`. **예상 비용 미표시**(실행 전 토큰 불명 → 추정치는 오해를 낳음). 버튼 `취소` / `실행`(주요).
  - 구현(2026-10-04 BM6): 페이지(큐·홈)가 `RunStartProvider` 하나를 두고 진입점은 `useRunStart()`로 주제(QueueItem.id·제목)를 넘겨 연다. 선택지·초기값은 서버(`lib/run-model-options`)가 만들어 props로. 단가 표기 `$입력 / $출력`(백만 토큰당, Dialog 설명에 단위). 실행 성공 → 실행 상세(`/runs?tab=active&id=`), 실패 → Dialog 안 사유. 요청 중에는 닫히지 않는다. `(기존 글)` 편은 세 진입점 모두 비활성 + "이미 발행된 글입니다.". 큐 상단 `맨 위 실행`은 대기 섹션 맨 위(보고 있는 탭과 무관, 홈 "다음 실행"과 같은 top), 대기가 비면 비활성.
  - (2026-10-04 BM6, 사용자 확인 — TopBar 칩 제거로 해소) **기본 모델에 API 키가 없으면 초기값 = 첫 실행 가능 모델**(비활성 항목이 선택된 채 열리지 않게). 실행 가능 모델이 하나도 없으면 초기값 없음 + `.env` 안내 + 실행 비활성. 칩이 있을 땐 설정값(칩)과 초기값이 달라 보이는 문제가 있었으나 칩을 없애 해소.
- **실행 상세**(/runs) 헤더: 상태 배지 옆 모델 label(작은 회색). 타임라인 한 줄: 기존 "단계명·상태·소요·토큰"에 **비용(USD, 소수 4자리)** 추가. 단계 모델이 Run 모델과 다르면 그 줄에만 모델 label.
- **재실행 ActionBar**: 단계 Select + 수정 지시 input 옆 모델 Select(초기값 = 원래 모델). 좁으면 ⋮ 안으로.
- ~~**TopBar 칩**~~ **없음**(2026-10-04 결정 변경, 사용자 제안): 늘 보이는 칩은 "앱 전체가 이 모델로 돈다"로 읽혀 "모델은 Run 속성"과 어긋나고, 키가 없을 때 칩과 Dialog 초기값이 달라 보였다. 이전: 칩 = 기본 모델 label, 클릭 → Select로 변경(BM9), 이번 달 비용 합계(Phase 2). 비용 합계는 홈 "이번 달 비용" 타일·설정 화면이 맡는다.
- **설정 > 모델·비용**(/settings/model): **기본 모델 Select는 Phase 1**(BM9, 칩 제거로 유일한 변경 지점 — 실행 중인 Run에는 영향 없음 안내). 어댑터 목록(available·단가)·월별 비용 표는 Phase 2.
- 이력(/runs/history)의 "모델" 컬럼은 기존 계획대로, 비용 컬럼은 단계 합산값.

## 이유

- 글 주제마다 필요한 품질·비용이 다르다 — 실무 글은 상위 모델, 짧은 회고는 저렴한 모델.
- 같은 주제를 두 모델로 돌려 비교하는 것이 이 프로젝트의 포트폴리오 가치("파이프라인 지휘")의 일부.
- 비용·토큰을 실행마다 기록하는 결정(킥오프 결정 6)과 맞물린다 — 모델이 실행 속성이어야 비용 집계가 의미 있다.

## 기각된 대안

- **전역 설정 하나(설정 화면에서만 변경)**: 실행 직전에 바꾸려면 화면을 오가야 하고, 이력에 "그때 어떤 모델이었나"가 안 남는다.
- **단계별 모델 지정(지금부터)**: 유용하지만 UI·상태가 복잡해진다 → **Phase 2 후보**. 단, 데이터 모델은 지금부터 오버라이드를 막지 않는 형태(`RunStep.modelId`)로 잡는다.

## 담당 (decisions/core-modules.md)

- 🔒 `ModelAdapter` **인터페이스 파일 = 사용자 직접 작성**(핵심 모듈 b). AI는 인터페이스 초안 제시 + `ModelRegistry` · Mock · Claude 어댑터 · 비용 계산 · 스키마 · UI 배선 · 테스트.

## 결정일

2026-09-09

## 갱신 이력

- 2026-09-09 최초 결정.
- 2026-09-09 **멀티 provider 확정**: 픽커에 Claude 4개(Fable 5.1·Opus 5·Sonnet 5·Haiku 4.5) + GPT 3개(gpt-5.5·gpt-5.1·gpt-5-mini) + Mock. provider 타입에 `openai` 추가, SDK 2개(`@anthropic-ai/sdk`·`openai`) 도입(라이브러리 추가 결정 = 이 문서). id·단가는 각 provider 라이브 문서에서 확인해 표로 고정. 기본 모델 = Opus 5.
- 2026-09-16 패키지명 치환: 구 스코프 이름 → `galley-ui`(P1b, decisions/package-name.md). 결정 변경 없음.
- 2026-09-26 BS5: 어댑터 `maxRetries` 1(레지스트리 상수). Mock 러너 조건(NODE_ENV)은 run-execution-model §2.
- 2026-10-04 BM5: `Settings.defaultModelId` 저장 형태(키-값 `Setting` 테이블)·폴백 규칙 구체화. 결정 변경 없음.
- 2026-10-04 BM6: 실행 시작 Dialog 구현 세부(Provider·서버 선택지·맨 위 실행 대상). 기본 모델에 키가 없을 때 초기값 = 첫 실행 가능 모델.
- 2026-10-04 **결정 변경(사용자 제안)**: TopBar 모델 칩 제거. 기본 모델 변경은 설정 > 모델·비용(`/settings/model`)의 Select 하나로(BM9 대체, Phase 1). BM6 초기값 보완(키 없으면 첫 실행 가능 모델)은 칩 제거로 불일치가 사라져 확정. 기각: "마지막으로 고른 모델 기억"(모르는 새 기본이 바뀜), "기본 모델 설정 없앰"(BM5 테이블 폐기).
