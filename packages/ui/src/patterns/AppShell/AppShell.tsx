import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

export interface AppShellProps {
  /** 상단 전체 폭 바(다크). */
  topBar: ReactNode;
  /** 좌측 사이드바. */
  sidebar: ReactNode;
  /** 우측 본문 영역. */
  children: ReactNode;
  /** 사이드바 접힘(아이콘 폭). 활성/저장은 앱이 관리. */
  sidebarCollapsed?: boolean;
}

export function AppShell({ topBar, sidebar, children, sidebarCollapsed }: AppShellProps) {
  return (
    <div className={styles.shell} data-collapsed={sidebarCollapsed ? 'true' : undefined}>
      <header className={styles.topbar}>{topBar}</header>
      <aside className={styles.sidebar}>{sidebar}</aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
