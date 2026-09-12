import type { ReactNode } from 'react';
import { getNavCounts } from '../../lib/nav-counts';
import { Sidebar } from './_components/Sidebar';
import { TopBar } from './_components/TopBar';
import { DashboardShell } from './_components/DashboardShell';
import { SidebarProvider } from './_components/SidebarProvider';
import styles from './layout.module.css';

// 셸의 배지·홈 타일은 요청마다 주제_큐.md를 읽어야 한다(파일이 진실 — queue-sync-direction).
// 이 설정이 없으면 Next가 이 레이아웃을 쓰는 라우트(홈·/runs·/publish·/settings/*)를
// 빌드 시점 값으로 프리렌더해, 큐를 고쳐도 화면이 그대로다.
export const dynamic = 'force-dynamic';

// TopBar+Sidebar 고정 셸. 페이지는 Content(children)만 갈아끼운다.
// 배지는 여기(서버)에서 홈 타일과 같은 소스로 조회해 넘긴다 — 둘이 어긋나지 않게(navigation.md).
export default async function DashboardLayout({ children }: { children: ReactNode }) {
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
