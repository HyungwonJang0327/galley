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
- B3a — posts/<슬러그>/ 5개 산출물 + evidence.json·verification.json 쓰기
- B3b — ThumbnailRenderer + make_thumb.py 호출

## Phase 1-B · 근거 수집 구조 (decisions/evidence-collection.md — 확정, BE1 착수는 사용자 승인 후)

테스트는 전부 tmpdir 픽스처 git 리포. 읽기 전용 리포엔 읽기 명령만. redact 함수 하나를 인덱싱·EvidenceBundle이 공유.

- BE1 — 스키마: Repo · RepoAnalysis(pointers ≥ 1) · IndexJob · TopicAnalysisLink(슬러그 키) · QueueItem 힌트 컬럼
- BE2 — 식별 정보 필터(.galley/redact.json 로더 + redact 함수 + 테스트)
- BE3 — 리포 인덱서: 파일 트리·area 분석 글(Mock 어댑터, 입력 상한 16KB/20개·160KB/30개)
- BE4 — 리포 인덱서: git log 기간·경로별 change 분석 글 + overview + 비용 기록
- BE5 — 증분 재인덱싱(HEAD 비교·stale) + `bin/index.ts` CLI
- BE6 — 주제_큐.md 괄호 힌트 파서 확장(리포 alias·키워드·기간) + 슬러그 파생
- BE7 — 주제↔분석 글 자동 연결(키워드·기간 매칭, 모델 없음, 워커 잡)
- BE8 — 근거 수집: linked 포인터 → git show 조각 → EvidenceBundle(snippet은 DATA_DIR, posts엔 포인터만)
- BE9 — 근거 수집: discovered 추가 탐색(키워드 점수만) + 상한 8
- BE10 — 근거 검증: 주장 추출(숫자·경로·식별자는 정규식, 서술은 모델) → 대조 → VerificationReport (본문 불변, 실패 아님)
- BE11 — 본문 입력을 EvidenceBundle로 제한(타입 강제) + 발행정보 `## 근거` 생성
- BE14 — 재실행 규칙(근거 수집 건너뜀·본문 재실행 시 검증 자동)
