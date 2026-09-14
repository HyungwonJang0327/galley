import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 프로세스 스모크(*.smoke.test.ts)는 기본 스위트에서 뺀다 — 실제 프로세스를 띄우므로
    // 별도 스크립트(test:smoke)·CI 잡으로 돈다(decisions/run-execution-model.md §3).
    exclude: [...configDefaults.exclude, '**/*.smoke.test.ts'],
    // *.db.test.ts의 beforeAll이 tmp SQLite에 `prisma migrate deploy`를 돈다. 파일별 워커가 동시에
    // CLI를 띄우면 CI 러너에서 기본 10s를 넘긴다(PR #92에서 3개 파일이 훅 타임아웃). 테스트 타임아웃은
    // 기본값 그대로 — 느린 건 훅뿐이다.
    hookTimeout: 30_000,
  },
});
