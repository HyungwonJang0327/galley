---
description: 테스트→빌드→CHANGELOG→버전 bump 제안→릴리즈 체크리스트 (@galley/ui 독립성 검증 포함)
allowed-tools: Read, Bash, Glob, Grep, Edit, Write
argument-hint: ''
---

1. `pnpm lint && pnpm typecheck && pnpm test` 실행. 실패하면 멈추고 보고.
2. `pnpm --filter @galley/ui build && pnpm --filter @galley/ui test` — 디자인 시스템 단독 통과 확인.
3. **@galley/ui 독립성 체크**: 도메인 단어·`next`/`apps/*`/`@galley/pipeline` import·딥 임포트가 없는지 확인. (폴더를 새 리포로 옮겨도 build 통과해야 함)
4. Changesets 기반 CHANGELOG·버전 bump를 **제안**한다(자동 publish 안 함).
5. 릴리즈 체크리스트 출력. **npm publish는 사용자 확인 후에만.**

배포·publish 명령은 항상 사용자 확인을 받는다.
