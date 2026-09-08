import type { ReactNode } from 'react';
import { Sidebar } from './_components/Sidebar';
import { TopBar } from './_components/TopBar';
import { DashboardShell } from './_components/DashboardShell';
import { SidebarProvider } from './_components/SidebarProvider';
import styles from './layout.module.css';

// TopBar+Sidebar 고정 셸. 페이지는 Content(children)만 갈아끼운다.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardShell topBar={<TopBar />} sidebar={<Sidebar />}>
        <div className={styles.page}>{children}</div>
      </DashboardShell>
    </SidebarProvider>
  );
}
