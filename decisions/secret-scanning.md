# ⑨ 시크릿 스캔: gitleaks

## 결정

gitleaks를 도입한다. **CI 잡**(gitleaks-action)과 **lefthook 기반 로컬 pre-commit 훅**(`gitleaks git --staged`) 둘 다. 첫 커밋 전부터 적용.
로컬 훅은 gitleaks 바이너리 필요(`brew install gitleaks`). 버전: gitleaks 8.30.1 · lefthook 2.1.12.

## 이유

- 리포는 public 예정이고 `.env`·Zenn 토큰 등 비밀값을 다룬다.
- 히스토리에 키가 커밋되면 회복 비용이 크다 → 처음부터 차단.

## 기각된 대안

- **안 함**: public 전환 시 키 유출 위험.

## 배포 시 변화

없음(보안 강화).

## 결정일

2026-09-08

## 갱신 이력

- 2026-09-08 최초 결정.
- 2026-09-08 로컬 훅 매니저를 **lefthook**으로 확정, pre-commit에서 `gitleaks git --staged` 실행.
