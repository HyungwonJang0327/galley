import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Next의 tsconfig는 jsx: preserve(Next가 변환)라 테스트에선 oxc(Vite 8 변환기)가 직접 변환해야 한다.
  oxc: { jsx: { runtime: 'automatic' } },
  // `server-only` 마커는 Node 기본 조건에서 던진다. 테스트에선 빈 모듈로 바꾼다(decisions/server-only-boundary.md).
  resolve: {
    alias: { 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) },
  },
  test: {
    // 컴포넌트 렌더링용 DOM. globals로 testing-library 자동 cleanup 활성화. (packages/ui와 동일)
    environment: 'happy-dom',
    globals: true,
    exclude: [...configDefaults.exclude, '**/.next/**'],
  },
});
