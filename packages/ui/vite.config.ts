import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { fileURLToPath } from 'node:url';

// 라이브러리 모드: JS(ESM+CJS) + 스코프 CSS Modules 단일 CSS 추출 + d.ts.
// tsup은 CSS Modules 로컬 스코프를 지원하지 않아 Vite로 교체(decisions/toolchain-pins.md).
export default defineConfig({
  plugins: [dts({ include: ['src'], insertTypesEntry: true })],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
      cssFileName: 'index',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
    cssCodeSplit: false,
    sourcemap: true,
    emptyOutDir: true,
  },
  css: {
    modules: {
      generateScopedName: 'ui_[local]_[hash:base64:5]',
    },
  },
});
