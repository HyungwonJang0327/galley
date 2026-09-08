'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown, Menu } from 'lucide-react';
import { TopBarChip } from '@galley/ui';
import { useSidebarCollapse } from './SidebarProvider';
import styles from './TopBar.module.css';

// Phase 1은 모델명만 표시. 전환·비용은 Phase 2.
const MODEL_LABEL = 'Claude Opus 4.8';

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarCollapse();
  const isSettings = pathname.startsWith('/settings');
  return (
    <>
      <div className={styles.left}>
        <TopBarChip onClick={toggle} aria-label="사이드바 접기/펼치기" aria-expanded={!collapsed}>
          <Menu size={18} aria-hidden="true" />
        </TopBarChip>
        <span className={styles.wordmark}>Galley</span>
        <TopBarChip isActive={!isSettings} onClick={() => router.push('/queue')}>
          글
        </TopBarChip>
        <TopBarChip isActive={isSettings} onClick={() => router.push('/settings/repos')}>
          설정
        </TopBarChip>
      </div>
      <div className={styles.right}>
        <TopBarChip trailing={<ChevronDown size={14} aria-hidden="true" />}>
          {MODEL_LABEL}
        </TopBarChip>
      </div>
    </>
  );
}
