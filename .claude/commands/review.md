---
description: reviewer로 현재 브랜치 diff를 리뷰하고, 승인한 항목만 수정한 뒤 판단을 worklog에 남긴다
allowed-tools: Read, Bash, Glob, Grep, Edit, Write, Task
argument-hint: ''
---

1. `reviewer` 에이전트로 현재 브랜치 diff를 리뷰한다(정확성·접근성·테스트 누락·컨벤션·성능 + Galley 특화 점검). 심각도 high/med/low로 목록화.
2. 지적 목록을 사용자에게 제시한다. **사용자가 승인한 항목만** 담당 에이전트/직접 수정.
3. 승인/기각 판단을 `worklog/{오늘}.md`에 남긴다(날짜는 `date +%Y-%m-%d`).

reviewer는 코드 수정 권한이 없다. 수정은 승인 후 별도로.
