import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
} from './Table';

function Sample(props: { onSort?: () => void; sort?: 'ascending' | 'descending' | null }) {
  return (
    <Table aria-label="표본" data-testid="t" density="sm" stickyHeader className="outer">
      <TableHead>
        <TableRow>
          <TableHeaderCell sortDirection={props.sort ?? null} onSort={props.onSort}>
            이름
          </TableHeaderCell>
          <TableHeaderCell numeric>수</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow selected>
          <TableCell>가</TableCell>
          <TableCell numeric>1</TableCell>
        </TableRow>
        <TableRow interactive>
          <TableCell>나</TableCell>
          <TableCell numeric>2</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

describe('Table', () => {
  it('네이티브 표 역할 — table·columnheader(scope=col)·row·cell, rest props는 table에, className은 래퍼에', () => {
    render(<Sample />);
    const table = screen.getByRole('table', { name: '표본' });
    expect(table.getAttribute('data-testid')).toBe('t');
    expect(table.getAttribute('data-density')).toBe('sm');
    expect(table.hasAttribute('data-sticky-header')).toBe(true);
    expect(table.parentElement?.classList.contains('outer')).toBe(true);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.getAttribute('scope'))).toEqual(['col', 'col']);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });

  it('정렬 없는 머리글은 aria-sort가 없고 버튼도 없다', () => {
    render(<Sample />);
    const th = screen.getByRole('columnheader', { name: '이름' });
    expect(th.hasAttribute('aria-sort')).toBe(false);
    expect(within(th).queryByRole('button')).toBeNull();
  });

  it('onSort가 있으면 머리글이 버튼이고, 정렬 방향이 있을 때만 th에 aria-sort', () => {
    const onSort = vi.fn();
    const { rerender } = render(<Sample onSort={onSort} />);
    const th = screen.getByRole('columnheader', { name: '이름' });
    expect(th.hasAttribute('aria-sort')).toBe(false);
    fireEvent.click(within(th).getByRole('button', { name: '이름' }));
    expect(onSort).toHaveBeenCalledTimes(1);
    rerender(<Sample onSort={onSort} sort="descending" />);
    expect(screen.getByRole('columnheader', { name: '이름' }).getAttribute('aria-sort')).toBe(
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: '수' }).hasAttribute('aria-sort')).toBe(false);
  });

  it('selected 행은 aria-selected, interactive 행은 data 속성만', () => {
    render(<Sample />);
    const [, selected, interactive] = screen.getAllByRole('row');
    expect(selected?.getAttribute('aria-selected')).toBe('true');
    expect(selected?.hasAttribute('data-selected')).toBe(true);
    expect(interactive?.hasAttribute('aria-selected')).toBe(false);
    expect(interactive?.hasAttribute('data-interactive')).toBe(true);
  });

  it('TableEmptyRow는 colSpan으로 한 칸이 전체 폭', () => {
    render(
      <Table aria-label="빈 표">
        <TableHead>
          <TableRow>
            <TableHeaderCell>a</TableHeaderCell>
            <TableHeaderCell>b</TableHeaderCell>
            <TableHeaderCell>c</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableEmptyRow colSpan={3}>없음</TableEmptyRow>
        </TableBody>
      </Table>,
    );
    const cell = screen.getByRole('cell', { name: '없음' });
    expect(cell.getAttribute('colspan')).toBe('3');
  });
});
