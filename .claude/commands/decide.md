---
description: 주제에 대한 선택지 표를 제시하고, 사용자가 고르면 decisions에 기록하고 planning에 반영한다
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
argument-hint: '{주제}'
---

주제: `$ARGUMENTS`

1. 선택지를 표(선택지 / 장점 / 단점 / 배포 시 변화 / 추천)로 제시하고 **사용자 결정을 기다린다**. 결정은 사용자가 한다.
2. 고르면 `date +%Y-%m-%d`로 날짜 확인 후 `decisions/{주제}.md` 작성: 결정 / 이유 / 기각된 대안 / 결정일 / 갱신 이력.
3. 기존 결정과 충돌하면 덮어쓰지 말고 "⚠️ 결정 변경 확인 필요"로 표시.
4. `planning.md`의 관련 표·체크에 반영.

끝나면 생성/갱신 파일을 보고한다.
