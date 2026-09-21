# galley-ui 배포 시 git 리포 분리 안 함 (모노레포 유지)

## 결정

- `galley-ui`는 **이 모노레포(`HyungwonJang0327/galley`)에서 `packages/ui`째로 npm에 배포한다.** 별도 git 리포로 떼내지 않는다.
- npm 페이지가 서브 폴더를 가리키게 하는 장치는 `packages/ui/package.json`의 `repository.directory: "packages/ui"`·`homepage`(P2a에서 이미 적용). 배포 대상 한정은 `.changeset/config.json`의 `ignore: ["dashboard", "@galley/pipeline"]`·`files: ["dist"]`.
- 리포는 이미 공개(PUBLIC)이고 루트 `LICENSE`(MIT)가 있다. 즉 "나중에 오픈소스로 푼다"가 아니라 **지금 상태가 오픈소스**다. 분리로 감출 것이 없다.

## 이유

- **대시보드가 galley-ui의 첫 소비자이자 검증 루프다.** ui 컴포넌트 PR마다 `/design` 갤러리 + `verify:layout` 실측이 같은 CI에서 돈다(decisions/layout-measurement.md). 리포를 나누면 ui 변경 → 배포 → 대시보드 버전 올림 → 그때 깨짐 발견의 왕복이 매번 생긴다.
- 갤러리(`apps/dashboard/app/design`)가 대시보드 셸 안에 산다(decisions/component-gallery.md). 분리하면 갤러리를 어디에 둘지 새 결정과 Next 앱 하나가 더 필요하다.
- gitleaks·lefthook·CI·브랜치 보호(decisions/branch-protection.md — 2026-09-15 API로 재적용)를 두 번째 리포에 다시 세팅해야 한다.
- 히스토리 분리(`git filter-repo`)와 decisions/의 ui 관련 절반을 어디에 둘지 정리하는 비용이 있다.
- 반대로 같은 리포에 두면 **양쪽에 이득**이다: npm에서 온 사람은 "이 디자인 시스템으로 실제 만든 앱"을 같은 리포에서 보고, Galley를 보러 온 사람은 ui가 경계를 지켜 떨어져 나와 배포까지 된 것을 본다(decisions/ui-package-boundary.md의 "처음부터 경계 강제"가 코드로 증명됨).

## 기각된 대안

- **별도 리포 `galley-ui`로 분리 후 배포**: 위 비용. 소비자가 Galley 하나뿐인 지금은 얻는 게 없다.
- **분리는 하지 않되 리포를 비공개로 두고 npm만 공개**: 리포가 이미 공개이고, npm 소비자가 `repository` 링크를 따라와 막히면 신뢰를 잃는다.

## 다시 검토할 신호

- galley-ui에 Galley 외의 **두 번째 소비자**가 생길 때(그때 갤러리를 ui 쪽으로 옮기고 Storybook류 도입 검토 — P7c와 묶음).
- 외부 기여자가 생겨 대시보드·파이프라인 코드가 ui 리뷰에 노이즈가 될 때.
- 릴리즈 주기가 대시보드와 명확히 갈릴 때(changesets가 이미 독립 버전이라 이 신호는 늦게 온다).

## 오픈소스 상태라 함께 확인한 것 (2026-09-20)

- 비밀값: `.env` gitignore + gitleaks(pre-commit·CI) — 장치 있음.
- 회사 식별 정보: `.galley/redact.json`은 **산출물**(인덱싱 summary·EvidenceBundle snippet) 필터다. 커밋되는 코드·worklog·decisions는 사람이 지킨다. CLAUDE.md §5·decisions/clean-room.md에 회사 리포 폴더명이 "열지 않는 경로"로 적혀 있음 — 공개 상태에서 그대로 둔다(2026-09-21 사용자 결정, 폴더명 자체는 비밀이 아님).
- 라이선스: `packages/ui/LICENSE`·루트 `LICENSE` 모두 MIT. `dashboard`·`@galley/pipeline`은 `private: true`라 npm에는 안 나가지만 리포가 공개이므로 코드는 루트 LICENSE를 따른다 — 파이프라인까지 MIT로 둔다(2026-09-21 사용자 결정 — 리포 전체 MIT, 루트 README 라이선스 절).

## 결정일

2026-09-20

## 갱신 이력

- 2026-09-20 최초 결정(사용자 질문 "npm 배포할 때 git 리포를 분리하는 게 좋을까?"에서 파생).
- 2026-09-21 미결 2건 해소(사용자): 회사 리포 폴더명 현행 유지 · 리포 전체 MIT.
