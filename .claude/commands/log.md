---
description: 이번 대화를 분석해 worklog에 기록하고 decisions/planning/todo를 갱신한다
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: '[주제]'
---

오늘 날짜를 `date +%Y-%m-%d`로 확인한다.

1. **worklog** `worklog/{오늘}.md`에 이전 `/log` 이후 대화분만 기록(파일 있으면 이어 붙임). 항목: 참여 에이전트 / 논의 내용(누가 어떤 의견) / 결론·결정 / 미결·다음. `$ARGUMENTS`가 있으면 그 주제 중심으로.
2. **decisions** 확정 사항을 `decisions/`에 병합. **덮어쓰기 금지** — 기존과 충돌하면 "⚠️ 결정 변경 확인 필요"로 표시하고 갱신 이력에 남긴다.
3. **planning.md** 확정된 체크·범위·미결 갱신.
4. **todo** 완료 항목에 날짜·커밋 해시 기록.

문서 역할 분리를 지킨다(planning=확정, decisions=이유, worklog=일지, todo=작업). 중복 기록 금지. 끝나면 갱신한 파일 목록을 보고한다.
