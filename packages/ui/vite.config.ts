import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { fileURLToPath } from 'node:url';

// 라이브러리 모드: JS(ESM+CJS) + 스코프 CSS Modules 단일 CSS 추출 + d.ts.
// tsup은 CSS Modules 로컬 스코프를 지원하지 않아 Vite로 교체(decisions/toolchain-pins.md).
export default defineConfig({
  plugins: [
    dts({
      include: ['src'],
      // 스토리·테스트 d.ts는 소비자에게 필요 없다(npm pack 결과에서 제외).
      exclude: ['**/*.stories.tsx', '**/*.test.tsx'],
      insertTypesEntry: true,
    }),
  ],
  // 개발 경고(src/internal/accessibleName.ts)의 NODE_ENV 분기를 빌드 시점 값으로 굳히지 않고 소비자 번들러에
  // 맡긴다 — React·Base UI dist와 같은 관례. 치환하지 않으면 Vite는 라이브러리 모드에서 'production'으로 굳힌다.
  define: { 'process.env.NODE_ENV': 'process.env.NODE_ENV' },
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
