---
description: 공개용 회고를 retro-public/에 작성한다 (내부 용어·에이전트 이름 노출 금지, 과장 금지)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: '[week|month|기간] [en]'
---

기간: `$ARGUMENTS`. `en`이 있으면 영어로. 날짜는 `date +%Y-%m-%d`로 확인.

`worklog/`·`decisions/`·`retro/`를 바탕으로 블로그·LinkedIn용 공개 회고를 `retro-public/`에 쓴다.

- **내부 용어·에이전트 이름(reviewer 등)·경로 노출 금지.** 과장 금지.
- 재실행 시: 이전 버전을 `retro-public/archive/`로 옮기고 완결본을 갱신한다.
- 톤: "AI 워크플로우를 지휘하는 프론트엔드" 포지셔닝에 맞게, 담백하게.
