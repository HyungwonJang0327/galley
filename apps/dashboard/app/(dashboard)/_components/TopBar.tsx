'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { TopBarChip } from 'galley-ui';
import { useSidebarCollapse } from './SidebarProvider';
import styles from './TopBar.module.css';

// 우측 모델 칩은 없다(2026-10-04 결정 변경 — 모델은 실행 Dialog에서 고르고, 기본 모델은 설정 > 모델·비용).
// 우측 자리는 워커 생존 점(BW6)이 쓴다. decisions/model-selection.md.
export function TopBar() {
  const { collapsed, toggle } = useSidebarCollapse();
  return (
    <div className={styles.left}>
      <TopBarChip onClick={toggle} aria-label="사이드바 접기/펼치기" aria-expanded={!collapsed}>
        <Menu size={18} aria-hidden="true" />
      </TopBarChip>
      <Link href="/" className={styles.wordmark}>
        Galley
      </Link>
    </div>
  );
}
