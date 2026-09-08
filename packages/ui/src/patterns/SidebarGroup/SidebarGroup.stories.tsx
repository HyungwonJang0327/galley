// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { SidebarGroup } from './SidebarGroup';

const meta = {
  title: 'Patterns/SidebarGroup',
  component: SidebarGroup,
};
export default meta;

export const Default = {
  args: {
    label: '주제',
    children: '항목들',
  },
};

export const Collapsed = {
  args: {
    label: '주제',
    children: '항목들',
    collapsed: true,
  },
};
