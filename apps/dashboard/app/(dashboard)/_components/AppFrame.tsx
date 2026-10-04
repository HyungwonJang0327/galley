import type { ReactNode } from 'react';
import { getNavCounts } from '../../../lib/nav-counts';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DashboardShell } from './DashboardShell';
import { SidebarProvider } from './SidebarProvider';
import styles from '../layout.module.css';

/**
 * TopBar+Sidebar 고정 셸. 페이지는 Content(children)만 갈아끼운다.
 *
 * 라우트 그룹 레이아웃과 **루트 not-found**가 같이 쓴다 — 404도 셸 안에서 보여야 하는데
 * 매칭되지 않은 경로는 그룹 레이아웃을 타지 않아, 셸 조립이 두 곳으로 갈리지 않게 여기 모은다.
 *
 * 배지는 여기(서버)에서 홈 타일과 같은 소스로 조회해 넘긴다 — 둘이 어긋나지 않게(navigation.md).
 * `getNavCounts`는 실패해도 던지지 않는다(셸이 죽으면 모든 화면이 500이 된다).
 */
export async function AppFrame({ children }: { children: ReactNode }) {
  const counts = await getNavCounts();
  const badges = {
    '/queue': counts.waiting,
    '/runs': counts.pendingApproval,
    '/publish': counts.publishPending,
  };

  return (
    <SidebarProvider>
      <DashboardShell topBar={<TopBar />} sidebar={<Sidebar badges={badges} />}>
        <div className={styles.page}>{children}</div>
      </DashboardShell>
    </SidebarProvider>
  );
}
