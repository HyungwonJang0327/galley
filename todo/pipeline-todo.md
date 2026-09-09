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
- 🔒 BM1 — 모델 어댑터 **인터페이스만** 사용자 작성 ← 구현 금지. **Mock·레지스트리·Claude 어댑터·비용은 AI가 구현**(인터페이스만 🔒 — decisions/core-modules·model-selection)
- BM2 — ModelRegistry(list/get/default·available)
- BM3 — Claude 어댑터 2개 + 단가 상수(id·단가 사용자 확정) + usage→cost 테스트
- BM4 — 스키마: Run.modelId · RunStep 토큰·비용·모델 컬럼
- BW1 — Run 워커 상태(queued/running/interrupted)·workerId·heartbeat 컬럼
- BW2 — 워커 루프(bin/worker.ts): 클레임·단계 오케스트레이션·heartbeat (구 B1f 대체)
- BW3 — 중단 감지·단계 재개
- B3a — posts/<슬러그>/ 5개 산출물 쓰기
- B3b — ThumbnailRenderer + make_thumb.py 호출
