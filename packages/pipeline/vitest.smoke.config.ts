import { defineConfig } from 'vitest/config';

// 프로세스 스모크만: pnpm --filter @galley/pipeline test:smoke
export default defineConfig({
  test: {
    include: ['**/*.smoke.test.ts'],
    // 프로세스 기동(Prisma 연결 포함)까지 넉넉히. 타이밍 단언은 테스트 안에 두지 않는다.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
