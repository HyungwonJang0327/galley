import type { Decorator, Preview } from '@storybook/react-vite';
import '../src/tokens/tokens.css';

// 테마 토글: 앱과 같은 방식(<html data-theme="dark">). 캔버스 배경·글자색도 토큰을 따르게 body에 건다.
const withTheme: Decorator = (Story, context) => {
  const dark = context.globals['theme'] === 'dark';
  if (dark) document.documentElement.dataset['theme'] = 'dark';
  else delete document.documentElement.dataset['theme'];
  document.body.style.backgroundColor = 'var(--ui-color-bg)';
  document.body.style.color = 'var(--ui-color-text)';
  document.body.style.fontFamily = 'var(--ui-font-sans)';
  return Story();
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Color theme (data-theme on <html>)',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'light' },
  parameters: {
    layout: 'centered',
    controls: { expanded: true },
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
};

export default preview;
