// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { AppShell } from './AppShell';

const meta = {
  title: 'Patterns/AppShell',
  component: AppShell,
};
export default meta;

export const Default = {
  args: {
    topBar: 'TopBar',
    sidebar: 'Sidebar',
    children: 'Content',
  },
};

export const Collapsed = {
  args: {
    topBar: 'TopBar',
    sidebar: 'Sidebar',
    children: 'Content',
    sidebarCollapsed: true,
  },
};
