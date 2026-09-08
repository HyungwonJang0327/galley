# decisions/

**왜 그렇게 정했나**를 기록한다. 확정 목록은 `planning.md`, 오늘 한 일은 `worklog/`.

## 규칙

- 주제별 kebab-case 파일 하나.
- 각 파일 항목: **결정 / 이유 / 기각된 대안 / 결정일 / 갱신 이력**.
- 기존 결정과 충돌하는 새 결정은 **덮어쓰지 않고** "⚠️ 결정 변경 확인 필요"로 표시하고 갱신 이력에 남긴다.
- 날짜는 `date +%Y-%m-%d`로 확인해 쓴다.

## 목록

### 기반 결정

- local-first — 로컬 우선, 배포 보류·가능성 유지
- monorepo — pnpm 모노레포 구조
- base-ui-over-shadcn — Base UI 채택(shadcn 기각)
- clean-room — 회사 코드 미열람·미복사
- publish-gate — 승인 전 공개 발행 금지
- ondemand-execution — 온디맨드 실행(스케줄 유지)
- team-naming — 역할명 그대로(사람 이름 기각)
- core-modules — 직접 작성 핵심 모듈 2개

### 기술 결정 (①~⑨)

- db-access-layer — SQLite + Prisma
- pipeline-execution-location — 같은 프로세스
- queue-sync-direction — 파일이 진실, DB 파생 캐시
- zenn-push — GitHub 연동 리포 커밋
- ui-style — CSS Modules + 토큰 변수
- dnd-library — pragmatic-drag-and-drop
- sidebar-collapse-persistence — localStorage
- turborepo — 미도입
- secret-scanning — gitleaks

### 경계·구조

- layout — 대시보드 레이아웃 스펙
- ui-package-boundary — @galley/ui 경계 규칙
- deploy-readiness — 배포 가능성 유지 규칙
