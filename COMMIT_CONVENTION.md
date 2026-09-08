# COMMIT_CONVENTION.md — Galley

형식: `type(scope): subject`

- **subject**: 한국어 명령형, 50자 이내, 마침표 없음. (예: `추가한다`가 아니라 `추가`)
- 한 커밋 = 한 가지 변경. 여러 작업을 모아 커밋하지 않는다. (상세: CLAUDE.md §8)

## type

| type     | 용도                  |
| -------- | --------------------- |
| feat     | 기능 추가             |
| fix      | 버그 수정             |
| design   | 토큰·스타일·시각 변경 |
| refactor | 동작 불변 구조 개선   |
| chore    | 설정·의존성·잡무      |
| docs     | 문서                  |
| test     | 테스트                |
| perf     | 성능                  |
| ci       | CI·워크플로           |

## scope

| scope     | 영역                                  |
| --------- | ------------------------------------- |
| dashboard | apps/dashboard 화면·라우트            |
| ui        | @galley/ui 토큰·컴포넌트              |
| pipeline  | @galley/pipeline 실행·상태머신·어댑터 |
| queue     | 큐·주제_큐.md 동기화                  |
| run       | 실행 이력·상태·타임라인               |
| publish   | Zenn push·발행 준비                   |
| model     | 모델 어댑터·토큰·비용                 |
| docs      | 문서(레포 루트 문서)                  |
| ci        | CI·워크플로                           |

## 예시

```
feat(ui): Button 컴포넌트와 토큰 변수 추가
feat(queue): 주제_큐.md 파서와 SQLite 적재 추가
fix(pipeline): 승인 대기 상태에서 단계 재실행 순서 교정
docs(docs): CLAUDE.md 스택 표를 실제 버전으로 갱신
chore: 프로젝트 기반 세팅
```

## 브랜치

- `type/scope-desc` — COMMIT_CONVENTION의 type·scope 재사용, 소문자 kebab-case, 설명 2~4단어.
  - 예: `feat/ui-button` · `feat/queue-parser` · `fix/pipeline-retry-order` · `chore/ci-gitleaks` · `docs/readme-screenshots`.
- 브랜치 하나 = todo 항목 하나(또는 아주 작은 기능 하나). 짧은 수명, 머지 후 삭제.
- main은 보호됨: 직접 push 금지, PR + CI 통과 필수, force-push·삭제 금지. (decisions/branch-protection.md)
- 머지 전략: **Rebase and merge** (원자적 커밋 보존·선형 히스토리). squash·merge commit은 저장소 설정에서 비활성. (decisions/branch-convention.md)
