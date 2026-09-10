# main 브랜치 보호

## 결정

`main`에 표준 보호를 적용한다:

- **PR 필수** — 직접 push 금지, 브랜치→PR로만 머지.
- **상태 체크 필수** — CI(`verify`, `gitleaks`, `layout`)가 통과해야 머지. strict(브랜치가 main 최신이어야 머지).
- **force-push·브랜치 삭제 금지.**
- 저장소 머지 옵션은 **Rebase만 허용**(squash·merge commit 비활성).
- 리뷰 필수는 끔(솔로라 자기 PR 승인 불가).

## 이유

- 깨진/시크릿 코드가 main에 실수로 들어가는 것을 서버측에서 차단.
- CLAUDE.md 작업 흐름(브랜치→PR→CI→머지)을 강제.

## 기각된 대안

- **보호 없음**: 실수로 깨진 코드·시크릿이 main 직행.
- **최소(force-push만 금지)**: 직접 push 허용은 편하나 CI 우회 가능.
- **리뷰 필수**: 솔로라 자기 PR 승인 불가 → 진행 불가.

## 참고

- 기반 세팅(초기 커밋~7-3)은 보호 적용 전 직접 push로 진행. 보호는 7-3 마지막에 활성화.
- 배포·팀 확장 시 리뷰 필수·CODEOWNERS 재검토.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
- 2026-09-10 필수 상태 체크에 `layout`(레이아웃 실측 잡, decisions/layout-measurement.md 2-B) 추가. PR #45에서 초록 3회 확인 뒤 사용자가 GitHub 설정에서 등록. API로 확인한 값: contexts `verify`·`gitleaks`·`layout`, strict.
