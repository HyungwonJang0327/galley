'use client';

import Link from 'next/link';
import { Menu } from 'lucide-react';
import { TopBarChip } from 'galley-ui';
import { useSidebarCollapse } from './SidebarProvider';
import styles from './TopBar.module.css';

export interface TopBarProps {
  /** 워커 생존 판정 — 서버(AppFrame)가 heartbeat를 읽어 넘긴다. 클라이언트는 pipeline을 모른다. */
  workerAlive: boolean;
}

// 우측 모델 칩은 없다(2026-10-04 결정 변경 — 모델은 실행 Dialog에서 고르고, 기본 모델은 설정 > 모델·비용).
// 우측 자리는 워커 생존 점(BW6) — decisions/run-location.md. 색만으로 상태를 전하지 않게 글자를 같이 둔다.
// 판정은 요청(화면 이동·새로고침) 때마다 — 같은 화면에 머무는 동안은 갱신되지 않는다.
export function TopBar({ workerAlive }: TopBarProps) {
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
      <p className={styles.worker} data-alive={workerAlive}>
        <span className={styles.dot} aria-hidden="true" />
        {workerAlive ? '워커 켜짐' : '워커 꺼짐'}
      </p>
    </>
  );
}
