---
description: worklog·decisions를 종합해 내부 회고를 retro/에 작성한다 (솔직하게)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: '[week|month|기간]'
---

기간: `$ARGUMENTS` (기본 week). 날짜는 `date +%Y-%m-%d`로 확인.

해당 기간의 `worklog/`·`decisions/`를 종합해 `retro/{기간}.md`에 내부 회고를 쓴다.

- 무엇을 했나 / 무엇이 잘됐나 / 무엇이 막혔나 / 결정 중 되돌린 것 / 다음에 바꿀 것.
- **솔직하게.** 과장·미화 없이.
- 같은 기간 재실행 시 시점 섹션을 누적한다(기존 내용 유지, 새 시점 추가).
