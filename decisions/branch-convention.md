# 브랜치 컨벤션·머지 전략

## 결정

- **브랜치 이름**: `type/scope-desc`. COMMIT_CONVENTION의 type(feat·fix·design·refactor·chore·docs·test·perf·ci)과 scope(dashboard·ui·pipeline·queue·run·publish·model·docs·ci)를 그대로 재사용. 소문자 kebab-case, 설명 2~4단어.
- **브랜치 하나 = todo 항목 하나**(또는 아주 작은 기능 하나). 짧은 수명, 머지 후 삭제. `main`은 항상 초록.
- **머지 전략: Rebase and merge.** squash·merge commit은 저장소 설정에서 비활성화.

## 이유

- 커밋 컨벤션과 어휘를 통일 → 규칙 하나만 외우면 됨, 브랜치만 봐도 작업 종류가 보임.
- Rebase merge는 브랜치의 **원자적 커밋을 그대로 보존**(선형 히스토리) → "한 커밋 = 한 변경, revert 가능" 원칙과 일치.

## 기각된 대안

- **squash merge**: PR을 커밋 1개로 뭉개 원자적 커밋 원칙과 충돌.
- **merge commit**: 커밋은 보존되나 머지 커밋이 히스토리에 쌓임.
- **feature/·bugfix/ 접두사**: 커밋 type과 어휘가 갈라짐.
- **티켓 번호 방식**: 이슈 트래커 없음.

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
