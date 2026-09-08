'use client';

import { useRouter, usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { TopBarChip } from '@galley/ui';
import styles from './TopBar.module.css';

// Phase 1은 모델명만 표시. 전환·비용은 Phase 2.
const MODEL_LABEL = 'Claude Opus 4.8';

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const isSettings = pathname.startsWith('/settings');
  return (
    <>
      <div className={styles.left}>
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
