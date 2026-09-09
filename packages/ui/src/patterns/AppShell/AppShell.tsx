import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

export interface AppShellProps {
  /** 상단 전체 폭 바(다크). */
  topBar: ReactNode;
  /** 좌측 사이드바. */
  sidebar: ReactNode;
  /** 우측 본문 영역. 스크롤은 이 영역 안에서만 일어난다(패딩은 소비자 래퍼에). */
  children: ReactNode;
  /** 사이드바 접힘(아이콘 폭). 활성/저장은 앱이 관리. */
  sidebarCollapsed?: boolean;
}

/**
 * 두 행 그리드: [TopBar] / [Sidebar | Content]. 루트는 뷰포트 높이에 고정되고
 * Sidebar·Content가 각자 스크롤한다 — 문서(body) 스크롤에 의존하지 않는다.
 */
export function AppShell({ topBar, sidebar, children, sidebarCollapsed }: AppShellProps) {
  return (
    <div className={styles.shell} data-collapsed={sidebarCollapsed ? 'true' : undefined}>
      <header className={styles.topbar}>{topBar}</header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>{sidebar}</aside>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
