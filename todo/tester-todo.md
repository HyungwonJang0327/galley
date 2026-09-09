# tester todo

상세·상태는 [mvp-todo.md](./mvp-todo.md). Vitest 단위 + 파이프라인 픽스처. 통과를 실제 실행으로 확인. 핵심 모듈(🔒)은 테스트만.

## Phase 1-A

- A4c — 주제_큐.md 파서 라운드트립 테스트(read→수정→write→re-read 동일)
- A6d — 큐 편집 파일 반영 무결성 테스트(어긋남 0)
- (보조) A2 컴포넌트 테스트는 ui-engineer가 컴포넌트와 함께 작성 — 커버리지·엣지 보강만

## Phase 1-B

- B1b — 상태 머신 전이 테스트(정상·수정 재실행·불가 전이) 🔒 대상
- B1d — 모델 어댑터 토큰·비용 기록 테스트(어댑터 목) 🔒 대상
- B3c — posts 산출물 5개 + evidence/verification 구조·파일명 테스트
- BE3~~BE5 — tmpdir 픽스처 git 리포 생성 헬퍼(커밋 여러 개·디렉터리 2~~3개) → 포인터 실재·증분 재인덱싱 검증 (decisions/evidence-collection.md)
- BE8·BE10 — snippet=commit 파일 내용 일치 테스트 · 픽스처 초안 supported 2/unsupported 1 테스트(Mock 어댑터)
