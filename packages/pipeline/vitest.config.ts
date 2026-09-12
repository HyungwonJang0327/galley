import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 프로세스 스모크(*.smoke.test.ts)는 기본 스위트에서 뺀다 — 실제 프로세스를 띄우므로
    // 별도 스크립트(test:smoke)·CI 잡으로 돈다(decisions/run-execution-model.md §3).
    exclude: [...configDefaults.exclude, '**/*.smoke.test.ts'],
  },
});
