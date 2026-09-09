# 실행별 모델 선택 (모델은 Run 속성)

## 결정

모델은 전역 설정이 아니라 **실행(Run) 단위 속성**이다. 실행을 시작할 때 고르고, `Run.modelId`에 기록되고, 재실행 시 그 단계만 바꿀 수 있다.

- 어댑터 계층은 `@galley/pipeline`에 둔다: `ModelAdapter` 인터페이스(🔒 직접 작성 핵심 모듈 b — decisions/core-modules.md) + `ModelRegistry` + 구체 어댑터. **멀티 provider**(`anthropic` + `openai`) — 유저가 실행 시 Claude·GPT를 함께 고른다.
- 파이프라인 단계 코드는 **어댑터 id만** 받고 provider를 모른다. `costUsd`는 어댑터가 계산하고 파이프라인은 합산만 한다.
- `Settings.defaultModelId` 하나 = 실행 Dialog 초기값 + TopBar 칩 표시값. **SQLite settings 테이블**에 저장.

## 어댑터 계층 (packages/pipeline)

- **ModelAdapter**(요구사항 — 인터페이스 파일은 🔒 사용자 작성, AI는 초안·나머지 배선·테스트): `id`(예 `anthropic:claude-opus-5`)·`label`·`provider`·가격(입력·출력 백만 토큰당 USD)·`available`(API 키 설정 여부) / `generate(input) → { text, usage:{ inputTokens, outputTokens }, costUsd, durationMs }`. **스트리밍은 Phase 1에 안 함** — 인터페이스에 자리만 남기지 않고 필요할 때 추가(YAGNI).
- **ModelRegistry**: `list()` / `get(id)` / `default()`. API 키 없는 provider의 어댑터는 목록에 남되 `available:false`(UI 비활성 + 툴팁 "API 키 없음 (.env ANTHROPIC_API_KEY / OPENAI_API_KEY)"). **레지스트리 정의 = `packages/pipeline` 코드 상수** — 어댑터 추가 = 파일 하나 + 등록 한 줄. 어댑터 provider 로직이 어차피 코드라 json 외부화 이득이 적다(YAGNI). 단가·레지스트리 외부화는 Phase 2.
- **SDK 의존성 2개**: `@anthropic-ai/sdk` + `openai`. 라이브러리 추가 결정은 이 문서로 갈음(설치·버전 핀은 BM3에서). provider 타입 `'anthropic' | 'openai' | 'mock'`.
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

- **실행 시작 Dialog**(@galley/ui Dialog): "지금 실행"이 눌리는 모든 진입점 — 큐 행 ⋮ · 큐 상단 `맨 위 실행` · 홈 "다음 실행" 카드 — 에서 **같은 Dialog**를 연다. 제목=주제명. 모델 Select(label + provider 보조 텍스트 + 우측 입력/출력 단가 회색 텍스트, `available:false`는 비활성 + 툴팁). 초기값 = `Settings.defaultModelId`. **예상 비용 미표시**(실행 전 토큰 불명 → 추정치는 오해를 낳음). 버튼 `취소` / `실행`(주요).
- **실행 상세**(/runs) 헤더: 상태 배지 옆 모델 label(작은 회색). 타임라인 한 줄: 기존 "단계명·상태·소요·토큰"에 **비용(USD, 소수 4자리)** 추가. 단계 모델이 Run 모델과 다르면 그 줄에만 모델 label.
- **재실행 ActionBar**: 단계 Select + 수정 지시 input 옆 모델 Select(초기값 = 원래 모델). 좁으면 ⋮ 안으로.
- **TopBar 칩**: `Settings.defaultModelId`의 label(+ 이번 달 비용 합계는 Phase 2). 클릭 → Select로 기본 모델 변경 = Settings 갱신. **실행 중인 Run에는 영향 없음**(툴팁 명시).
- **설정 > 모델·비용**(/settings/model, Phase 2): 기본 모델 Select + 어댑터 목록(available·단가) + 월별 비용 표.
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
