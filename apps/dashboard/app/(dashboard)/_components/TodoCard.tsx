import Link from 'next/link';
import { Badge, Button, Card, EmptyState, InlineAlert, ListRow, ListRows } from 'galley-ui';
import type { TodoRunsView } from '../../../lib/home-runs';
import styles from './HomeRunCards.module.css';

// 홈 "지금 할 일" 카드(layout.md §4 행 2 좌): 승인 대기 실행 최대 5 — 행 = 주제 · 마지막 단계 · 대기 시작 시각 ·
// 상태 배지(옆에 "근거 없음 n") · `검수` 링크. 넘치면 "n개 더 보기". 표현 전용 — 데이터는 홈 페이지가 넘긴다.

export function TodoCard({
  view,
  error,
}: {
  /** 조회 실패면 undefined(그때 `error`가 있다). */
  view: TodoRunsView | undefined;
  error: string | undefined;
}) {
  return (
    <Card>
      <h2 className={styles.title}>지금 할 일</h2>
      {error !== undefined ? (
        <InlineAlert tone="danger" variant="plain">
          {error}
        </InlineAlert>
      ) : view === undefined || view.rows.length === 0 ? (
        <EmptyState message="검수할 초안이 없습니다." />
      ) : (
        <>
          <ListRows>
            {view.rows.map((row) => (
              <ListRow
                key={row.id}
                title={row.title}
                meta={row.meta}
                trailing={
                  <>
                    {row.flag === undefined ? null : (
                      <span className={styles.flag}>{row.flag}</span>
                    )}
                    <Badge tone={row.badge.tone} pulse={row.badge.pulse}>
                      {row.badge.label}
                    </Badge>
                  </>
                }
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`${row.title} 검수`}
                    render={<Link href={row.href} />}
                  >
                    검수
                  </Button>
                }
              />
            ))}
          </ListRows>
          {view.moreCount > 0 ? (
            <p className={styles.more}>
              <Link href={view.moreHref}>{view.moreCount}개 더 보기</Link>
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
