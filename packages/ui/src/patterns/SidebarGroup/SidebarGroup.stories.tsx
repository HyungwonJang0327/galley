// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { SidebarGroup } from './SidebarGroup';

const meta = {
  title: 'Patterns/SidebarGroup',
  component: SidebarGroup,
};
export default meta;

export const Default = {
  args: {
    label: '분류',
    children: '항목들',
  },
};

export const Collapsed = {
  args: {
    label: '분류',
    children: '항목들',
    collapsed: true,
  },
};
