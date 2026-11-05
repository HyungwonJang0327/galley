import Link from 'next/link';
import { Badge, Card, EmptyState, ListRow, ListRows } from 'galley-ui';
import type { RecentRunRow } from '../../../lib/home-runs';
import styles from './HomeRunCards.module.css';

// 홈 "최근 실행" 카드(layout.md §4 행 3): 최근 5 — 행 = 주제(→실행 상세) · 모델 · 시간 · 결과 배지.
// 헤더 우측 "이력 전체 →"(/runs/history). 표현 전용 — 데이터는 홈 페이지가 넘긴다.

export function RecentRunsCard({
  rows,
  error,
}: {
  /** 조회 실패면 undefined(그때 `error`가 있다). */
  rows: readonly RecentRunRow[] | undefined;
  error: string | undefined;
}) {
  return (
    <Card>
      <div className={styles.header}>
        <h2 className={styles.title}>최근 실행</h2>
        <Link className={styles.headerLink} href="/runs/history">
          이력 전체 →
        </Link>
      </div>
      {error !== undefined ? (
        <p role="alert">{error}</p>
      ) : rows === undefined || rows.length === 0 ? (
        <EmptyState message="아직 실행한 기록이 없습니다." />
      ) : (
        <ListRows>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              title={<Link href={row.href}>{row.title}</Link>}
              meta={`${row.model} · ${row.time}`}
              trailing={
                <Badge tone={row.badge.tone} pulse={row.badge.pulse}>
                  {row.badge.label}
                </Badge>
              }
            />
          ))}
        </ListRows>
      )}
    </Card>
  );
}
