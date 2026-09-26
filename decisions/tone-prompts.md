# 어투 프롬프트: 리포 파일 + 내용 해시를 RunStep에 기록

## 결정

벨로그 본문·링크드인·Zenn 단계가 쓰는 **어투 프롬프트는 리포 안 파일**이다 — `.galley/prompts/{velog,linkedin,zenn}.md`(단계당 하나, `.galley/redact.json`과 같은 자리). 사람이 에디터로 고치고 git이 이력을 갖는다.

**어투 파일은 Run의 입력이다.** StepRunner가 읽은 파일 **내용의 해시**(sha256)를 그 `RunStep.promptHash` 컬럼에 기록한다. UI에는 노출하지 않는다(컬럼 하나, 표시 없음).

- 읽는 주체는 StepRunner(단계 구현)이고 워커는 모른다. StepRunner가 `StepResult.promptHash`로 돌려주면 워커는 토큰·비용과 같은 방식으로 **기록만** 한다(추정하지 않는다).
- 파일이 없으면 그 단계는 실패다(재시도 불가 — 파일을 만들어야 풀린다). 기본값을 코드에 두지 않는다.
- 편집 UI는 Phase 2 설정 화면(`/settings/prompts`)이 **이 파일을 편집하는 UI**로 붙는다. 저장소를 DB로 바꾸지 않는다.

## 이유

- **결과 차이를 설명할 수 있어야 한다.** 같은 주제의 시도(attempt) 사이에 결과가 달라졌을 때 `Run.instruction`(수정 지시)만으로는 설명이 안 되는 경우가 생긴다 — 그 사이 어투 파일을 고쳤을 수 있다. 해시가 있으면 "지시는 같은데 어투가 바뀌었다"를 이력에서 판별할 수 있다.
- 파일이면 버전 관리·diff·롤백이 git으로 공짜다. 설정 화면이 없는 MVP에서도 사람이 바로 고칠 수 있다.
- 식별 정보 필터(`.galley/redact.json`)와 같은 "리포에 두는 사람 편집 설정" 자리라 위치 규칙이 하나로 모인다.

## 기각된 대안

- **SQLite `Settings` 테이블 컬럼**: 화면에서 바꾸기 쉽지만 편집 UI가 Phase 2라 MVP에선 초기값이 코드에 박힌다. 버전 이력도 없다.
- **`BLOG_DIR` 안 파일(`~/Desktop/blog/prompts/`)**: 블로그 자산과 한곳이지만 Galley 설정이 블로그 리포로 샌다. 도구 설정은 도구 리포에.
- **프롬프트 원문을 RunStep에 저장**: 해시로 충분하다. 원문은 git에 있고, 행은 가볍게 유지한다(decisions/error-handling.md "단계 실패 기록"과 같은 원칙).

## 결정일

2026-09-13

## 갱신 이력

- 2026-09-13 최초 결정(사용자). 해시 기록 요구는 사용자가 추가 — "같은 주제 시도 간 결과 차이를 지시 컬럼만으로 설명 못 하는 경우를 막기 위한 것".
- 2026-09-22 BS1 구현에서 정한 것: ① 폴더는 `.env`의 `PROMPTS_DIR`이 있으면 그것, 없으면 리포 루트 `.galley/prompts`(redact 로더와 같은 규칙 — 테스트는 tmpdir 주입) ② 실패는 값으로 셋 — `PROMPT_NOT_FOUND`(파일 없음)·`PROMPT_UNREADABLE`(권한·디렉터리)·`PROMPT_EMPTY`(공백뿐 — 어투 없이 글을 쓰지 않는다). 셋 다 재시도 불가(단계 구현 BS2~~BS4가 `StepFailure`로 옮긴다) ③ 해시는 파일 내용 UTF-8 바이트의 sha256 hex — 앞뒤 공백도 내용이다(한 글자만 달라도 다른 해시) ④ 워커 경로: `StepResult.promptHash` → `StepOutcome.promptHash` → `RunStep.promptHash`(마이그레이션 `run_step_prompt_hash`). Mock 러너는 어투 단계에서 고정 문자열의 해시를 돌려줘 기록 경로를 CI가 겪는다 ⑤ 초안 파일 세 개를 리포에 커밋(`.gitignore`는 `.galley/redact*`만 무시) — 자리만 잡은 초안이며 실제 어투는 사용자가 채운다. 단계 구현(BS2~~BS4)이 `loadTonePrompt`를 부르고 프롬프트에 붙인다.
- 2026-09-22 BS1 리뷰 반영(reviewer high 0 · med 3 · low 9, 사용자 결정): ⑥ **어투 파일은 prettier 대상에서 제외**(`.prettierignore`) — 포맷터가 내용(=해시)을 바꾸거나 무관한 PR의 CI를 깨지 않게. 파일에는 **어투만** 두고 설명·메모는 `.galley/prompts/README.md`에(주석도 모델 입력에 그대로 간다) ⑦ **`PROMPTS_DIR`은 절대경로만**(사용자 결정) — 워커와 대시보드는 cwd가 달라 상대경로는 같은 값이 다른 폴더를 가리킨다. `resolveTonePromptsDir`가 `PROMPTS_DIR_NOT_ABSOLUTE`를 값으로 돌려주고 BS5 배선이 기동 거부로 잇는다. `REDACT_CONFIG_PATH`도 같은 규칙으로 묶을지는 BS5 때 결정(지금 `.env.example`은 상대경로 예시) ⑧ carried 단계 행은 `promptHash`도 복사하지 않는다(modelId·토큰·비용과 같은 규칙 — 값은 `sourceRunId`가 가리키는 행에). 기록만(BS2~BS4): 세 실패 코드를 `StepFailure(retryable=false)`로 옮기는 헬퍼 하나를 BS2에 두고 재사용 · `errorMessage`에 절대경로(`tonePromptPath`) 금지, 파일명만 · `promptsDir`는 deps 주입(`resolveTonePromptsDir`는 조립 루트에서만) · 모델 텍스트에서는 앞 BOM 하나를 걷어내도 됨(해시는 원본) · 주석뿐인 파일은 `PROMPT_EMPTY`가 아니다(파일에 어투만 두는 규칙으로 대신한다) · 링크드인 링크 자리는 `[벨로그 링크]`.
- 2026-09-26 BS5 배선: ⑦ 이행 — `resolveTonePromptsDir` 실패를 워커 기동 거부로 이었다(`PROMPTS_DIR_NOT_ABSOLUTE`). **`REDACT_CONFIG_PATH` 절대경로 규칙은 미결로 남김**(`.env.example` 상대경로 예시 유지) — 워커·대시보드 cwd가 다른 문제는 같으므로 다음에 REDACT_CONFIG_PATH를 건드릴 때 같은 규칙으로 묶는다.
