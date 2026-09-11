import Link from 'next/link';
import {
  Badge,
  Card,
  ListRow,
  ListRows,
  ListToolbar,
  ListToolbarTab,
  PageHeader,
} from '@galley/ui';
import { getQueueSections } from '../../../lib/queue-data';
import { queueStatusBadgeVariant } from '../../../lib/queue-status-badge';
import { queueHref } from '../../../lib/queue-tabs';
import { buildQueueView } from '../../../lib/queue-view';
import { reloadQueueAction } from './actions';
import { CategoryFilter } from './CategoryFilter';
import { ReloadQueueButton } from './ReloadQueueButton';
import styles from './page.module.css';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 큐 1화면(목록형 A). 탭 = 주제_큐.md 섹션 4개, 활성 탭·카테고리는 URL(?tab=·?category=).
// 요청마다 파일→DB 재적재 후 읽는다(decisions/queue-sync-direction.md). 로직은 lib/queue-view.
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [params, result] = await Promise.all([searchParams, getQueueSections()]);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="큐" actions={<ReloadQueueButton reload={reloadQueueAction} />} />
        <Card>
          <p className={styles.note} role="alert">
            {result.error.message}
          </p>
        </Card>
      </>
    );
  }

  const view = buildQueueView(result.data, { tab: params.tab, category: params.category });
  const badgeVariant = queueStatusBadgeVariant(view.active.status);

  return (
    <>
      <PageHeader title="큐" actions={<ReloadQueueButton reload={reloadQueueAction} />} />
      <Card>
        <ListToolbar
          aria-label="큐 섹션"
          tabs={view.tabs.map((tab) => (
            <ListToolbarTab
              key={tab.id}
              label={tab.status}
              count={tab.count}
              isActive={tab.isActive}
              render={<Link href={queueHref(tab.id)} />}
            />
          ))}
          filters={
            view.categories.length > 0 ? (
              <div className={styles.filter}>
                <CategoryFilter categories={view.categories} value={view.category} />
              </div>
            ) : undefined
          }
        />
        {view.rows.length > 0 ? (
          <ListRows>
            {view.rows.map((row, index) => (
              <ListRow
                key={`${index}-${row.title}`}
                title={row.title}
                meta={row.meta}
                trailing={<Badge variant={badgeVariant}>{view.active.status}</Badge>}
              />
            ))}
          </ListRows>
        ) : (
          <p className={styles.note}>{view.active.status} 섹션에 주제가 없습니다.</p>
        )}
      </Card>
    </>
  );
}
