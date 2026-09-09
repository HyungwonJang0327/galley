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
      // Base UI(서브패스 import)·lucide는 런타임 의존성으로 소비자가 한 벌만 갖는다.
      external: ['react', 'react-dom', 'react/jsx-runtime', /^@base-ui\/react/, 'lucide-react'],
      output: {
        // Rollup은 모듈 지시어를 버린다. 상태 있는 프리미티브(Dialog·Select)가 RSC 소비자에서
        // 깨지지 않도록 번들 전체를 클라이언트로 표시(decisions/ui-package-boundary.md).
        banner: '"use client";',
      },
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
