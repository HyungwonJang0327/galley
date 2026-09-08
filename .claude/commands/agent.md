---
description: 진행 중 새 에이전트를 추가한다 (역할·경계·tools·읽을 문서 규칙대로 + todo 생성)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: '{역할} [설명]'
---

역할·설명: `$ARGUMENTS`

`.claude/agents/{역할}.md`를 기존 에이전트 규칙대로 생성한다:

- frontmatter: name, description("언제 호출하는가" 구체적으로), tools(역할에 맞는 최소 권한).
- 본문: 역할 / 담당 영역 / 산출물 위치 / 행동 방식 / 경계.
- 공통 규칙 포함: 시작 시 planning·decisions·자기 todo·최근 worklog 2개 읽기 / 다른 에이전트 직접 호출 안 함 / 영역 밖은 반환 / 결정은 사용자 / 한 커밋=한 변경 즉시 / 한 번에 작업 하나.
- **현재 상태를 파일에 하드코딩하지 않는다.**

`todo/{역할}-todo.md`도 함께 생성한다. 끝나면 생성 파일을 보고한다.
