import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 컴포넌트 렌더링용 DOM. globals로 testing-library 자동 cleanup 활성화.
    environment: 'happy-dom',
    globals: true,
  },
});
