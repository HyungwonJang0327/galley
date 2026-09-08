import type { ReactNode } from 'react';
import { AppShell } from '@galley/ui';
import { Sidebar } from './_components/Sidebar';
import { TopBar } from './_components/TopBar';

// TopBar+Sidebar 고정 셸. 페이지는 Content(children)만 갈아끼운다.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell topBar={<TopBar />} sidebar={<Sidebar />}>
      {children}
    </AppShell>
  );
}
