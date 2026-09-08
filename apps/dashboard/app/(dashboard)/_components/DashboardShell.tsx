'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@galley/ui';
import { useSidebarCollapse } from './SidebarProvider';

interface DashboardShellProps {
  topBar: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}

// 접힘 상태를 컨텍스트에서 읽어 AppShell 슬롯에 배선하는 클라 셸.
// (layout.tsx는 서버 컴포넌트라 컨텍스트를 직접 읽지 못하므로 이 경계가 필요.)
export function DashboardShell({ topBar, sidebar, children }: DashboardShellProps) {
  const { collapsed } = useSidebarCollapse();
  return (
    <AppShell topBar={topBar} sidebar={sidebar} sidebarCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}
