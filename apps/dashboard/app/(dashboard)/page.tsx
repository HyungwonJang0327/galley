import Link from 'next/link';
import { PageHeader, StatTile } from '@galley/ui';
import { getNavCounts } from '../../lib/nav-counts';
import { nextSchedule } from '../../lib/schedule';
import styles from './page.module.css';

// 홈(요약형 — layout.md §4). 루트 `/`는 redirect하지 않는다(decisions/navigation.md 2026-09-09 변경).
// 카운트는 사이드바 배지와 같은 소스(lib/nav-counts) — 타일과 배지가 어긋나지 않게.
export default async function HomePage() {
  const counts = await getNavCounts();
  const schedule = nextSchedule(new Date(), process.env.TZ ?? 'Asia/Seoul');

  return (
    <>
      <PageHeader
        title="홈"
        actions={<span className={styles.schedule}>다음 자동 실행: {schedule.label}</span>}
      />
      <div className={styles.tiles}>
        <StatTile
          label="대기"
          value={counts.waiting}
          tone={counts.waiting === 0 ? 'muted' : 'default'}
          render={<Link href="/queue?tab=waiting" />}
        />
        {/* 승인 대기만 값이 있을 때 주황(layout.md §4). */}
        <StatTile
          label="승인 대기"
          value={counts.pendingApproval}
          tone={counts.pendingApproval === 0 ? 'muted' : 'warning'}
          render={<Link href="/runs" />}
        />
        <StatTile
          label="발행 대기"
          value={counts.publishPending}
          tone={counts.publishPending === 0 ? 'muted' : 'default'}
          render={<Link href="/publish" />}
        />
        <StatTile label="이번 달 비용" value={counts.monthlyCostUsd} tone="muted" />
      </div>
    </>
  );
}
