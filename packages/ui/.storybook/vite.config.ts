import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Storybook 전용 Vite 설정 — 라이브러리 빌드(vite.config.ts의 lib·dts·external)를 끌어오지 않는다.
// CSS Modules 클래스명은 배포 빌드와 같은 규칙(dist와 같은 모양으로 보이게).
export default defineConfig({
  plugins: [react()],
  css: { modules: { generateScopedName: 'ui_[local]_[hash:base64:5]' } },
});
