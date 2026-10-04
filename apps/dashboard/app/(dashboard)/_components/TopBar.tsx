'use client';

import Link from 'next/link';
import { ChevronDown, Menu } from 'lucide-react';
import { TopBarChip } from 'galley-ui';
import { useSidebarCollapse } from './SidebarProvider';
import styles from './TopBar.module.css';

/**
 * `modelLabel` = 설정의 기본 모델 label. 서버(AppFrame)가 읽어 넘긴다 — 클라이언트는 pipeline을 모른다
 * (decisions/server-only-boundary.md). 칩 클릭으로 바꾸기는 BM9, 비용 합계는 Phase 2.
 */
export function TopBar({ modelLabel }: { modelLabel: string }) {
  const { collapsed, toggle } = useSidebarCollapse();
  return (
    <>
      <div className={styles.left}>
        <TopBarChip onClick={toggle} aria-label="사이드바 접기/펼치기" aria-expanded={!collapsed}>
          <Menu size={18} aria-hidden="true" />
        </TopBarChip>
        <Link href="/" className={styles.wordmark}>
          Galley
        </Link>
      </div>
      <div className={styles.right}>
        <TopBarChip trailing={<ChevronDown size={14} aria-hidden="true" />}>
          {modelLabel}
        </TopBarChip>
      </div>
    </>
  );
}
