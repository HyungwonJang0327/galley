// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { SidebarItem } from './SidebarItem';

const meta = {
  title: 'Patterns/SidebarItem',
  component: SidebarItem,
};
export default meta;

export const Default = { args: { label: '문서' } };
export const Active = { args: { label: '문서', isActive: true } };
export const WithBadge = { args: { label: '문서', badge: '3' } };
export const Collapsed = { args: { label: '문서', collapsed: true } };
