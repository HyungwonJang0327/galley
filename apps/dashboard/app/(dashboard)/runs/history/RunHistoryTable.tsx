'use client';
import { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  type SortDirection,
} from 'galley-ui';
import type { RunHistoryRow } from '../../../../lib/run-history';
import styles from './RunHistoryTable.module.css';

// 실행 이력 표 — galley-ui Table의 첫 실제 자리(decisions/table-component.md). Table은 표현만, 정렬 상태·비교는 여기.
// 데이터는 서버(page.tsx → lib/run-history)가 표시값까지 만들어 넘긴다 — 이 파일은 pipeline 값을 import하지 않는다.

export type RunHistorySortKey = 'startedAt' | 'title' | 'status' | 'duration' | 'tokens' | 'cost';

export interface RunHistorySort {
  key: RunHistorySortKey;
  direction: SortDirection;
}

/** 기본: 시작 시각 최신순. */
export const DEFAULT_RUN_HISTORY_SORT: RunHistorySort = {
  key: 'startedAt',
  direction: 'descending',
};

/** null(기록 없음)은 어느 방향이든 맨 뒤. */
function compareNullable(a: number | null, b: number | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === 'ascending' ? a - b : b - a;
}

export function sortRunHistory(
  rows: readonly RunHistoryRow[],
  { key, direction }: RunHistorySort,
): RunHistoryRow[] {
  const sign = direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case 'title':
        return sign * a.title.localeCompare(b.title, 'ko');
      case 'status':
        return sign * a.badge.label.localeCompare(b.badge.label, 'ko');
      case 'duration':
        return compareNullable(a.durationMs, b.durationMs, direction);
      case 'tokens':
        return compareNullable(a.tokens, b.tokens, direction);
      case 'cost':
        return compareNullable(a.costUsd, b.costUsd, direction);
      case 'startedAt':
        return sign * a.startedAt.localeCompare(b.startedAt);
    }
  });
}

/** 같은 열을 다시 누르면 방향 반전, 다른 열은 숫자 열은 내림차순·글자 열은 오름차순부터. */
export function nextRunHistorySort(
  current: RunHistorySort,
  key: RunHistorySortKey,
): RunHistorySort {
  if (current.key === key) {
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  const numeric = key === 'startedAt' || key === 'duration' || key === 'tokens' || key === 'cost';
  return { key, direction: numeric ? 'descending' : 'ascending' };
}

const COLUMN_COUNT = 8;

export function RunHistoryTable({
  rows,
  initialSort = DEFAULT_RUN_HISTORY_SORT,
}: {
  rows: readonly RunHistoryRow[];
  initialSort?: RunHistorySort;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<RunHistorySort>(initialSort);
  // 행 어디를 눌러도 실행 상세로(layout.md "행 클릭 → /runs?id="). 제목 링크 자체를 눌렀으면 Link가 가니 겹치지 않게 둔다.
  const onRowClick = (href: string) => (event: MouseEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest('a') !== null) return;
    router.push(href);
  };
  const sorted = sortRunHistory(rows, sort);
  const header = (key: RunHistorySortKey, label: string, numeric = false) => (
    <TableHeaderCell
      numeric={numeric}
      sortDirection={sort.key === key ? sort.direction : null}
      onSort={() => setSort(nextRunHistorySort(sort, key))}
    >
      {label}
    </TableHeaderCell>
  );
  return (
    <Table aria-label="실행 이력">
      <TableHead>
        <TableRow>
          {header('title', '주제')}
          {header('status', '상태')}
          <TableHeaderCell>단계</TableHeaderCell>
          <TableHeaderCell>모델</TableHeaderCell>
          {header('startedAt', '시작')}
          {header('duration', '소요', true)}
          {header('tokens', '토큰', true)}
          {header('cost', '비용', true)}
        </TableRow>
      </TableHead>
      <TableBody>
        {sorted.length === 0 ? (
          <TableEmptyRow colSpan={COLUMN_COUNT}>아직 실행한 기록이 없습니다.</TableEmptyRow>
        ) : (
          sorted.map((row) => (
            <TableRow key={row.id} interactive onClick={onRowClick(row.href)}>
              <TableCell>
                <Link href={row.href}>{row.title}</Link>
                {row.attempt > 1 ? <span className={styles.attempt}> {row.attempt}차</span> : null}
              </TableCell>
              <TableCell>
                <Badge tone={row.badge.tone} pulse={row.badge.pulse}>
                  {row.badge.label}
                </Badge>
              </TableCell>
              <TableCell>
                <span className={styles.nowrap}>{row.lastStep}</span>
                <span className={styles.progress}>
                  {' '}
                  {row.doneCount}/{row.stepCount}
                </span>
              </TableCell>
              <TableCell className={styles.nowrap}>{row.model}</TableCell>
              <TableCell className={styles.nowrap}>
                <time dateTime={row.startedAt}>{row.startedAtText}</time>
              </TableCell>
              <TableCell numeric>{row.durationText}</TableCell>
              <TableCell numeric>{row.tokensText}</TableCell>
              <TableCell numeric>{row.costText}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
