import type { StorybookConfig } from '@storybook/react-vite';

// galley-ui 정식 쇼케이스(decisions/docs-site.md). 스토리는 src 안 CSF3 파일, 소개는 이 폴더의 MDX.
// Vite 설정은 라이브러리 빌드용(vite.config.ts — lib·dts)과 섞이지 않게 .storybook/vite.config.ts를 따로 쓴다.
const config: StorybookConfig = {
  stories: ['./*.mdx', '../src/**/*.mdx', '../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
  docs: { defaultName: 'Docs' },
};

export default config;
