# Changesets

이 폴더의 변경 기록으로 `galley-ui` 버전·CHANGELOG를 관리한다. (앱 `dashboard`, `@galley/pipeline`은 배포 대상이 아니라 `ignore`.)

- 변경 추가: `pnpm changeset`
- 버전 반영: `pnpm changeset version`
- 배포: `/ship` 체크리스트 경유 → `pnpm changeset version` 커밋 PR → 머지 → `pnpm changeset tag` → `git push origin galley-ui@<버전>` → **GitHub Actions가 publish**(`.github/workflows/publish.yml`, npm Trusted Publishing — decisions/ci-publish.md). 사람이 `npm publish`를 치지 않는다. 확인은 `curl https://registry.npmjs.org/galley-ui`(`npm view`는 캐시).

자세한 내용은 [Changesets 문서](https://github.com/changesets/changesets).
