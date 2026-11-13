# galley-ui CI publish: 태그 push가 트리거, 인증은 npm Trusted Publishing(OIDC)

## 결정

**`galley-ui@<버전>` 태그가 push되면 GitHub Actions가 빌드·테스트 뒤 `npm publish`한다.** 인증은 npm **Trusted Publishing**(GitHub Actions OIDC) — 토큰·시크릿을 두지 않고, provenance가 자동으로 붙는다.

- 워크플로: `.github/workflows/publish.yml`(`on: push: tags: ['galley-ui@*']`, 잡 권한 `id-token: write`·`contents: read`).
- 순서: checkout → pnpm install(frozen) → `galley-ui` build + test → **태그 버전 = `packages/ui/package.json` 버전 검증**(다르면 실패) → `npm publish --provenance --access public`(`packages/ui`에서).
- 버전 bump·CHANGELOG는 지금처럼 **사람이 `/ship` 체크리스트 → `pnpm changeset version` 커밋 → PR → 머지**. 머지 뒤 `pnpm changeset tag` + 태그 push(에이전트)가 publish를 시작한다.
- 사람이 하는 일 중 **npm 로그인·`npm publish`만 사라진다.** 버전 PR은 required check 4개를 그대로 탄다.

## 사용자가 한 번 할 일

npmjs.com → `galley-ui` → Settings → **Trusted Publisher** → GitHub Actions: Organization/user `HyungwonJang0327`, Repository `galley`, Workflow filename `publish.yml`, Environment 비움. 등록 전에 태그를 push하면 publish 단계가 인증 오류로 실패한다(빌드·테스트는 돈다).

## 이유

- 두 번의 수동 릴리즈(0.1.0 2026-09-21 · 0.2.0 2026-11-12)에서 아팠던 건 **인증**이었다 — 세션 토큰 만료(E401), 2FA 패스키라 셸에서 publish 불가. OIDC는 토큰 자체를 없앤다.
- 흐름을 바꾸지 않는다. `/ship` → 버전 PR → 머지 → 태그는 이미 하던 순서라 문서·습관이 그대로다.
- 봇 PR·PAT가 없다. 워크플로 하나, 시크릿 0.

## 기각된 대안

- **changesets/action 완전 자동(Version PR 봇 + 머지 시 publish)**: `GITHUB_TOKEN`이 만든 PR에는 워크플로가 돌지 않아 required check가 안 생기고 머지가 막힌다. 풀려면 PAT 또는 GitHub App 토큰이 필요 — "토큰 만료" 문제를 다른 자리로 옮긴다. 쌓인 changeset을 봇 PR 하나로 묶는 리듬도 지금의 "/ship 뒤 릴리즈"와 다르다. 필요해지면 이 결정의 publish 잡을 재사용한다.
- **현행 유지(수동 publish)**: 릴리즈마다 토큰·2FA로 사람이 끼는 비용을 실제로 냈다.
- **main push에서 package.json 버전이 레지스트리와 다르면 자동 태그+publish**: 태그 한 줄을 덜 쓰는 대신 "레지스트리 조회 → 비교 → 태그" 로직이 CI에 들어간다. 1단계는 태그 트리거로 충분하고, 나중에 그 위에 얹을 수 있다.

## 영향

- `.changeset/README.md`·`/ship` 체크리스트 5단계의 publish 문구 갱신("일반 터미널에서 npm publish" → "태그 push → Actions").
- 태그 버전과 package.json 버전이 어긋나면 publish가 실패해 알려 준다(잘못된 태그를 지우고 다시 push).
- 레지스트리 확인은 전과 같이 `curl registry.npmjs.org/galley-ui`(`npm view`는 캐시).

## 결정일

2026-11-12

## 갱신 이력

- 2026-11-12 최초 결정(P7b, 사용자 "1번으로" — 선택지 3개 중 "태그 push 트리거 + Trusted Publishing").
- 2026-11-14 첫 실전 성공: `galley-ui@0.2.1` 태그 → run 43525951061 success, provenance 서명, 레지스트리 latest 0.2.1. 사용자는 Trusted Publisher 등록(Allow npm publish 체크 — 스테이징 승격 없이 직접 publish)만 했다. 레지스트리 확인은 CDN 캐시 때문에 `curl -H "Cache-Control: no-cache" "https://registry.npmjs.org/galley-ui?nocache=<ts>"`로(`npm view`는 한동안 404/옛 값). 결정 변경 없음.
