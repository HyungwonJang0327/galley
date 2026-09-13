import { parseRunView, runsHref } from '../../../lib/run-view';
import { getRunList } from '../../../lib/run-list';
import {
  ActionBar,
  Badge,
  Button,
  Card,
  EmptyState,
  ListRow,
  ListRows,
  PageHeader,
  SplitPane,
} from '@galley/ui';
import { runStatusBadge } from '../../../lib/run-labels';
import Link from 'next/link';
import { getRunDetail } from '../../../lib/run-detail';
import styles from './page.module.css';
import { RunTimeline } from './RunTimeline';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { filter, selectedId } = parseRunView(params);

  const result = await getRunList(filter);
  if (!result.ok) {
    return (
      <>
        <PageHeader title="실행" />
        <Card>
          <p role="alert">{result.error.message}</p>
        </Card>
      </>
    );
  }
  const { data: lists } = result;
  const activeId = selectedId ?? lists[0]?.id;
  const detail = activeId ? await getRunDetail(activeId) : undefined;
  const selected = detail?.ok ? detail.data : undefined;
  const headerBadge = selected ? runStatusBadge(selected.status) : undefined;
  return (
    <>
      <PageHeader title="실행" />
      <Card>
        <SplitPane
          listLabel="실행 목록"
          detailLabel="실행 상세"
          list={
            <ListRows>
              {lists.map((list) => {
                const badge = runStatusBadge(list.status);
                return (
                  <ListRow
                    key={list.id}
                    title={
                      <Link href={runsHref({ ...filter, selectedId: list.id })}>
                        {list.topicTitle}
                      </Link>
                    }
                    trailing={
                      <Badge variant={badge.variant} pulse={badge.pulse}>
                        {badge.label}
                      </Badge>
                    }
                    isActive={list.id === activeId}
                  />
                );
              })}
            </ListRows>
          }
          header={
            selected &&
            headerBadge && (
              <div className={styles.detailHeader}>
                <strong>{selected.topicTitle}</strong>
                <span className={styles.attempt}>{selected.attempt}차</span>
                <Badge variant={headerBadge.variant} pulse={headerBadge.pulse}>
                  {headerBadge.label}
                </Badge>
              </div>
            )
          }
          footer={
            <ActionBar
              label="수정 지시"
              actions={
                <>
                  <Button variant="secondary" size="sm" disabled>
                    재실행
                  </Button>
                  <Button size="sm" disabled>
                    승인
                  </Button>
                </>
              }
            >
              <input aria-label="수정 지시 입력" placeholder="수정 지시를 입력하세요." disabled />
            </ActionBar>
          }
        >
          {selected ? (
            <RunTimeline steps={selected.steps} />
          ) : detail && !detail.ok && detail.error.code === 'RUN_DETAIL_FAILED' ? (
            <p className={styles.note} role="alert">
              {detail.error.message}
            </p>
          ) : (
            <EmptyState message="선택된 실행이 없습니다." />
          )}
        </SplitPane>
      </Card>
    </>
  );
}
