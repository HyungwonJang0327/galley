import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Next의 tsconfig는 jsx: preserve(Next가 변환)라 테스트에선 oxc(Vite 8 변환기)가 직접 변환해야 한다.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    // 컴포넌트 렌더링용 DOM. globals로 testing-library 자동 cleanup 활성화. (packages/ui와 동일)
    environment: 'happy-dom',
    globals: true,
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
});
