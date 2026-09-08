# pipeline todo

상세·상태는 [mvp-todo.md](./mvp-todo.md). `@galley/pipeline`(서버 전용). 공개 발행 금지, 새 슬러그 폴더에만 쓰기, 비밀값 `.env`.

🔒 = **직접 작성**(사용자 구현). 이 에이전트는 구현하지 않고 **테스트·리뷰만** — decisions/core-modules.md.

## Phase 1-A

- A4a — Prisma·SQLite 스키마·클라이언트
- A4b — 주제_큐.md 파서·라이터(Storage/LocalFsStorage)
- A4d — 파일→DB 적재(파일이 진실)
- A6c — 큐 편집을 주제_큐.md에 반영(fe와 함께)

## Phase 1-B

- 🔒 B1a — 단계 상태 머신 + 승인 게이트 ← 구현 금지, 테스트만
- 🔒 B1c — 모델 어댑터 인터페이스 + Claude 어댑터 ← 구현 금지, 테스트만
- B1e — Run 스키마 저장·조회
- B1f — 단계 실행 오케스트레이션
- B3a — posts/<슬러그>/ 5개 산출물 쓰기
- B3b — ThumbnailRenderer + make_thumb.py 호출
