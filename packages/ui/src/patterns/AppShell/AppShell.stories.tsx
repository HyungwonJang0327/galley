// Storybook 스토리(CSF3). Phase 1은 스토리 파일만, 실행 환경은 Phase 2.
import { AppShell } from './AppShell';
import { SidebarGroup } from '../SidebarGroup';
import { SidebarItem } from '../SidebarItem';

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

/** 긴 콘텐츠: 스크롤해도 TopBar·Sidebar는 그대로, 스크롤바는 Content 영역 안에만. */
export const LongContent = {
  args: {
    topBar: 'TopBar',
    sidebar: 'Sidebar',
    children: (
      <div>
        {Array.from({ length: 60 }, (_, i) => (
          <p key={i}>본문 단락 {i + 1}</p>
        ))}
      </div>
    ),
  },
};

/** 메뉴 20개: 사이드바만 따로 스크롤된다. */
export const LongSidebar = {
  args: {
    topBar: 'TopBar',
    sidebar: (
      <SidebarGroup label="그룹">
        {Array.from({ length: 20 }, (_, i) => (
          <SidebarItem key={i} label={`항목 ${i + 1}`} isActive={i === 0} />
        ))}
      </SidebarGroup>
    ),
    children: 'Content',
  },
};
