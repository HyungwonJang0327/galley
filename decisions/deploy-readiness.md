# 배포 가능성 유지 규칙

지금은 로컬이지만 나중에 Vercel·VPS 등에 올릴 수 있어야 한다. **구현이 아니라 "막지 않기"가 목적.**

## 결정

- **경로**: 로컬 절대경로(`~/Desktop/blog` 등)를 코드에 쓰지 않는다. `BLOG_DIR`·`REPO_DIRS`·`ZENN_CONTENT_DIR`은 `.env`, 기본값도 설정 파일에서만.
- **저장소 경계**: 파일 읽기/쓰기(주제_큐.md, posts/, 코드 폴더 근거 수집)는 `@galley/pipeline`의 `Storage` 인터페이스 뒤. 첫 구현 `LocalFsStorage`. 나중에 GitHub·S3 구현으로 교체 가능하게 인터페이스만 먼저 고정.
- **DB**: SQLite는 Prisma 접근 계층 뒤. Postgres 전환 시 스키마·쿼리 수정 최소(→ db-access-layer).
- **실행 위치**: 파이프라인 실행은 `@galley/pipeline` 함수, 앱은 호출만. 나중에 워커로 추출 쉽게(→ pipeline-execution-location).
- **인증 자리**: 로그인 없음. 대신 `app/(dashboard)` 라우트 그룹 하나 아래에 두고, 요청 컨텍스트에 `userId`(지금 고정값 `"local"`)를 통과시키는 자리만. 멀티유저 데이터 모델은 만들지 않는다.
- **썸네일**: `tools/make_thumb.py`(Python+Playwright)는 Phase 1에선 그대로 호출하되 `ThumbnailRenderer` 인터페이스 뒤. 배포에 Python이 없을 수 있어 Node(Playwright/satori) 구현으로 교체 가능하게.
- **비밀값**: API 키·Zenn 토큰은 `.env`로만. 코드·SQLite·산출물 파일에 절대 안 씀.
- **OS 의존**: macOS 전용 명령(`open`, `pbcopy`)·경로 구분자 가정 금지.

## 하지 않는 것

실제 배포 설정(Dockerfile, vercel.json), 로그인 구현, 멀티유저 스키마. 위 경계만 지킨다.

## 기각된 대안

- **경계 없이 로컬 직결**: 나중 배포 시 광범위 재작성.
- **지금 배포 구현**: Phase 1~2 범위 초과(→ local-first).

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
