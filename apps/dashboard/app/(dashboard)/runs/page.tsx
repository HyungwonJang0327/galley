import { parseRunView, runsHref } from '../../../lib/run-view';
import { getRunList } from '../../../lib/run-list';
import { runListRowView } from '../../../lib/run-list-row';
import { pickActiveId, resolveRunPane } from '../../../lib/run-page';
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
import { isRunInProgress, runStatusBadge } from '../../../lib/run-labels';
import Link from 'next/link';
import { getRunDetail } from '../../../lib/run-detail';
import styles from './page.module.css';
import { RunTimeline } from './RunTimeline';
import { RunPoller } from './RunPoller';
import { RunStepDots } from './RunStepDots';

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
  const activeId = pickActiveId(lists, selectedId);
  const pane = resolveRunPane(activeId ? await getRunDetail(activeId) : undefined);
  const selected = pane.kind === 'selected' ? pane.run : undefined;
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
                const view = runListRowView(list);
                const doneCount = view.dots.filter((d) => d.status === 'done').length;
                return (
                  <ListRow
                    key={list.id}
                    leading={
                      <RunStepDots
                        dots={view.dots}
                        label={`단계 진행 ${doneCount}/${view.dots.length}`}
                      />
                    }
                    meta={`${view.lastStep} · ${view.time}`}
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
            <>
              {/* 다른 실행을 고르면 폴러를 새로 만든다 — 같은 인스턴스가 "running → 아님" 전환으로
                  오인해 refresh를 한 번 더 부르지 않도록. */}
              <RunPoller key={selected.id} active={isRunInProgress(selected.status)} />
              <RunTimeline steps={selected.steps} />
            </>
          ) : pane.kind === 'failed' ? (
            <p className={styles.note} role="alert">
              {pane.message}
            </p>
          ) : (
            <EmptyState message="선택된 실행이 없습니다." />
          )}
        </SplitPane>
      </Card>
    </>
  );
}
