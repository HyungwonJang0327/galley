# ① DB 접근 계층: SQLite + Prisma

## 결정

로컬 저장은 SQLite. ORM은 Prisma. Prisma를 접근 계층으로 두어 배포 시 Postgres 전환 비용을 최소화한다.

## 이유

- SQLite는 로컬 단일 사용자 도구에 무설치(파일 1개).
- Prisma는 익숙하고, `datasource provider` 교체만으로 SQLite→Postgres 전환이 사실상 최저 비용.
- 상태값(대기/후보/보류/완료, 실행 상태)은 SQLite에서 native enum 미지원이므로 **string + 애플리케이션 레벨 체크**로 표현.

## 기각된 대안

- **SQLite + Drizzle**: 경량이나 Prisma 대비 사용자 익숙도 낮음.
- **Postgres + Prisma(지금부터)**: 로컬에 Postgres 상시 구동 필요 → 솔로 로컬 도구에 마찰. 확정된 SQLite 결정 변경.
- **Prisma 외 Kysely/raw**: 마이그레이션·타입 편의 손해.

## 배포 시 변화

better-sqlite 계열 → Postgres: Prisma `provider` 한 줄 + 재생성. 스키마·쿼리 대부분 유지.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정. (초안에서 Drizzle 추천 → 사용자 익숙도 이유로 Prisma로 확정)
