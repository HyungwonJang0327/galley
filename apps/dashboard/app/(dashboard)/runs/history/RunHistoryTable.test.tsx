import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { RunHistoryRow } from '../../../../lib/run-history';
import {
  DEFAULT_RUN_HISTORY_SORT,
  nextRunHistorySort,
  RunHistoryTable,
  sortRunHistory,
} from './RunHistoryTable';

function row(overrides: Partial<RunHistoryRow> & { id: string }): RunHistoryRow {
  return {
    href: `/runs?tab=done&id=${overrides.id}`,
    title: overrides.id,
    attempt: 1,
    badge: { label: '완료', tone: 'success', pulse: false },
    lastStep: '발행정보·썸네일 완료',
    doneCount: 6,
    stepCount: 6,
    model: 'Claude X',
    startedAt: '2026-11-15T03:00:00.000Z',
    startedAtText: '11. 15. 12:00',
    durationMs: 1000,
    durationText: '1초',
    tokens: 100,
    tokensText: '100',
    costUsd: 0.01,
    costText: '$0.0100',
    ...overrides,
  };
}

const rows = [
  row({ id: 'a', title: '가', startedAt: '2026-11-13T00:00:00.000Z', costUsd: 0.03, tokens: 300 }),
  row({ id: 'b', title: '나', startedAt: '2026-11-15T00:00:00.000Z', costUsd: null, tokens: null }),
  row({ id: 'c', title: '다', startedAt: '2026-11-14T00:00:00.000Z', costUsd: 0.01, tokens: 100 }),
];

function bodyTitles(): string[] {
  const [, body] = screen.getAllByRole('rowgroup');
  return within(body!)
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent?.trim() ?? '');
}

describe('sortRunHistory', () => {
  it('기본은 시작 시각 최신순', () => {
    expect(sortRunHistory(rows, DEFAULT_RUN_HISTORY_SORT).map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('숫자 열은 기록 없음(null)이 어느 방향이든 맨 뒤', () => {
    expect(sortRunHistory(rows, { key: 'cost', direction: 'descending' }).map((r) => r.id)).toEqual(
      ['a', 'c', 'b'],
    );
    expect(sortRunHistory(rows, { key: 'cost', direction: 'ascending' }).map((r) => r.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('글자 열은 한국어 로캘 오름차순', () => {
    expect(
      sortRunHistory(rows, { key: 'title', direction: 'ascending' }).map((r) => r.title),
    ).toEqual(['가', '나', '다']);
  });
});

describe('nextRunHistorySort', () => {
  it('같은 열은 반전, 다른 열은 숫자면 내림차순·글자면 오름차순부터', () => {
    const start = DEFAULT_RUN_HISTORY_SORT;
    expect(nextRunHistorySort(start, 'startedAt')).toEqual({
      key: 'startedAt',
      direction: 'ascending',
    });
    expect(nextRunHistorySort(start, 'cost')).toEqual({ key: 'cost', direction: 'descending' });
    expect(nextRunHistorySort(start, 'title')).toEqual({ key: 'title', direction: 'ascending' });
  });
});

describe('RunHistoryTable', () => {
  it('기본 정렬로 그리고 시작 열에 aria-sort가 붙는다, 제목은 실행 상세 링크', () => {
    render(<RunHistoryTable rows={rows} />);

    expect(bodyTitles()).toEqual(['나', '다', '가']);
    const started = screen.getByRole('columnheader', { name: /시작/ });
    expect(started.getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByRole('link', { name: '가' }).getAttribute('href')).toBe(
      '/runs?tab=done&id=a',
    );
  });

  it('열 머리를 누르면 정렬이 바뀐다(주제 오름차순 → 다시 누르면 내림차순)', () => {
    render(<RunHistoryTable rows={rows} />);
    const title = screen.getByRole('columnheader', { name: /주제/ });

    fireEvent.click(within(title).getByRole('button'));
    expect(bodyTitles()).toEqual(['가', '나', '다']);
    expect(title.getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('columnheader', { name: /시작/ }).hasAttribute('aria-sort')).toBe(
      false,
    );

    fireEvent.click(within(title).getByRole('button'));
    expect(bodyTitles()).toEqual(['다', '나', '가']);
  });

  it('2차 이상 시도는 제목 옆에 "N차", 단계 열은 마지막 단계와 완료 수', () => {
    render(
      <RunHistoryTable rows={[row({ id: 'r', title: '재시도', attempt: 2, doneCount: 3 })]} />,
    );

    const [, body] = screen.getAllByRole('rowgroup');
    const cells = within(body!).getAllByRole('cell');
    expect(cells[0]!.textContent).toBe('재시도 2차');
    expect(cells[2]!.textContent?.replace(/\s+/g, ' ').trim()).toBe('발행정보·썸네일 완료 3/6');
  });

  it('행이 없으면 빈 행 한 줄', () => {
    render(<RunHistoryTable rows={[]} />);
    expect(screen.getByText('아직 실행한 기록이 없습니다.')).toBeTruthy();
  });
});
