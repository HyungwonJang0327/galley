# ④ Zenn push: GitHub 연동 리포 커밋

## 결정

Zenn 발행은 GitHub 연동 방식. 승인된 글을 `zenn-content` 리포의 `articles/<슬러그>.md`로 커밋·push하며, frontmatter `published: false`(下書き)까지만.

- 리포: https://github.com/HyungwonJang0327/zenn-content (private, 생성 완료).
- 로컬 클론 경로는 `.env`의 `ZENN_CONTENT_DIR`. `@galley/pipeline`의 `Storage` 뒤 `GitHubZennStorage`로 구현.
- ⚠️ Zenn 계정↔리포 연결(zenn.dev/dashboard/deploys, GitHub App 설치)은 사람이 직접(웹 OAuth). Phase 2에서 실제 push 붙이기 전까지 하면 됨.

## 이유

- GitHub 연동은 Zenn 공식 방식, 자동화 가능, 下書き 그대로 인식.
- Storage 인터페이스 뒤라 배포 시 토큰만 서버 env로 옮기면 됨.

## 기각된 대안

- **Zenn CLI 로컬 프리뷰 + 수동 복사**: "Zenn에 下書き로 push된다" 완료 기준 미충족.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정. zenn-content 리포 생성·스캐폴드(articles/, README) push 완료.
