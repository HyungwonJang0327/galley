---
description: 특정 에이전트를 호출하기 전 브리핑을 생성한다 (완료/진행/다음/최근 결정/주의점/커밋 규칙)
allowed-tools: Read, Glob, Grep, Bash
argument-hint: '{역할} [주제]'
---

역할·주제: `$ARGUMENTS`

`todo/{역할}-todo.md`·`decisions/`·최근 `worklog/` 2개를 읽고 다음을 출력한다:

- **완료** (Phase별)
- **진행 중·블로커**
- **다음 Top 3**
- **최근 결정 중 이 역할에 영향 있는 것**
- **이번 작업 주의점** (기각된 방향 포함)
- **커밋 규칙** (한 커밋=한 변경, COMMIT_CONVENTION scope)

`[주제]`가 있으면 그 작업용 에이전트 프롬프트까지 작성한다. (에이전트를 직접 호출하지는 않는다 — 프롬프트만.)
