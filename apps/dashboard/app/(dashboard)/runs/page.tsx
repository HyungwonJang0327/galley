// pipeline 런타임 값(INSTRUCTION_MAX_LENGTH)을 쓰므로 서버 전용 마커(decisions/server-only-boundary.md).
import 'server-only';
import { parseRunView, runsHref } from '../../../lib/run-view';
import { getRunList } from '../../../lib/run-list';
import { runListRowView } from '../../../lib/run-list-row';
import { pickActiveId, resolveRunPane } from '../../../lib/run-page';
import { INSTRUCTION_MAX_LENGTH } from '@galley/pipeline';
import { Badge, Card, EmptyState, ListRow, ListRows, PageHeader, SplitPane } from 'galley-ui';
import {
  isPendingApproval,
  isRunInProgress,
  runStatusBadge,
  STEP_OPTIONS,
} from '../../../lib/run-labels';
import Link from 'next/link';
import { getRunDetail } from '../../../lib/run-detail';
import { getRunSeries } from '../../../lib/run-series';
import styles from './page.module.css';
import { RunTimeline } from './RunTimeline';
import { RunPoller } from './RunPoller';
import { RunActionBar } from './RunActionBar';
import { RunStepDots } from './RunStepDots';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { filter, selectedId } = parseRunView(params);

  // ?id=가 있으면 상세는 목록과 무관하다 — 둘을 같이 띄운다. 없을 때만 목록 첫 행을 기다려 하나 더.
  const [result, preselected] = await Promise.all([
    getRunList(filter),
    selectedId ? getRunDetail(selectedId) : undefined,
  ]);
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
  const pane = resolveRunPane(preselected ?? (activeId ? await getRunDetail(activeId) : undefined));
  const selected = pane.kind === 'selected' ? pane.run : undefined;
  const headerBadge = selected ? runStatusBadge(selected.status) : undefined;
  // 시리즈 편이면 헤더 아래 한 줄(○○ 시리즈 N/M편 · 이전·다음 편). 못 읽으면 줄만 빠진다.
  const series = selected ? await getRunSeries(selected.topicId) : undefined;
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
                      <Badge tone={badge.tone} pulse={badge.pulse}>
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
              <div>
                <div className={styles.detailHeader}>
                  <h2 className={styles.topicTitle}>{selected.topicTitle}</h2>
                  <span className={styles.attempt}>{selected.attempt}차</span>
                  <Badge tone={headerBadge.tone} pulse={headerBadge.pulse}>
                    {headerBadge.label}
                  </Badge>
                </div>
                {series ? (
                  <p className={styles.series}>
                    <span className={styles.seriesSummary}>{series.summary}</span>
                    {series.previousTitle === undefined ? null : (
                      <span className={styles.seriesNeighbor}>이전 편: {series.previousTitle}</span>
                    )}
                    {series.nextTitle === undefined ? null : (
                      <span className={styles.seriesNeighbor}>다음 편: {series.nextTitle}</span>
                    )}
                  </p>
                ) : null}
              </div>
            )
          }
          footer={
            // 실행이 바뀌면 입력·Dialog 상태를 버린다. 판정(승인 대기인가)은 서버가 한다.
            <RunActionBar
              key={selected?.id ?? 'none'}
              runId={selected?.id ?? ''}
              enabled={selected !== undefined && isPendingApproval(selected.status)}
              steps={STEP_OPTIONS}
              maxLength={INSTRUCTION_MAX_LENGTH}
            />
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
