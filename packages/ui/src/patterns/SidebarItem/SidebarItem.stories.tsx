// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { SidebarItem } from './SidebarItem';

const meta = {
  title: 'Patterns/SidebarItem',
  component: SidebarItem,
};
export default meta;

export const Default = { args: { label: '큐' } };
export const Active = { args: { label: '큐', isActive: true } };
export const WithBadge = { args: { label: '큐', badge: '3' } };
export const Collapsed = { args: { label: '큐', collapsed: true } };
