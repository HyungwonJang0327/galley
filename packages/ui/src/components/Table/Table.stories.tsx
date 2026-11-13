// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeaderCell,
  TableRow,
  type SortDirection,
} from './Table';

const meta = {
  title: 'Components/Table',
  component: Table,
};
export default meta;

const ROWS = [
  { name: 'Alpha', owner: 'Kim', count: 12, updated: '2026-01-04' },
  { name: 'Beta', owner: 'Lee', count: 3, updated: '2026-02-11' },
  { name: 'Gamma', owner: 'Park', count: 48, updated: '2026-03-20' },
];

function Static({ density, stickyHeader }: { density?: 'md' | 'sm'; stickyHeader?: boolean }) {
  return (
    <Table aria-label="Sample" density={density} stickyHeader={stickyHeader}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Owner</TableHeaderCell>
          <TableHeaderCell numeric>Count</TableHeaderCell>
          <TableHeaderCell>Updated</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ROWS.map((r) => (
          <TableRow key={r.name}>
            <TableCell>{r.name}</TableCell>
            <TableCell>{r.owner}</TableCell>
            <TableCell numeric>{r.count}</TableCell>
            <TableCell>{r.updated}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export const Basic = { render: () => <Static /> };
export const Compact = { render: () => <Static density="sm" /> };

export const Sortable = {
  render: function SortableStory() {
    const [key, setKey] = useState<'name' | 'count'>('name');
    const [dir, setDir] = useState<SortDirection>('ascending');
    const toggle = (k: 'name' | 'count') => {
      if (k === key) setDir(dir === 'ascending' ? 'descending' : 'ascending');
      else {
        setKey(k);
        setDir('ascending');
      }
    };
    const rows = [...ROWS].sort((a, b) => {
      const c = key === 'name' ? a.name.localeCompare(b.name) : a.count - b.count;
      return dir === 'ascending' ? c : -c;
    });
    return (
      <Table aria-label="Sortable sample">
        <TableHead>
          <TableRow>
            <TableHeaderCell
              sortDirection={key === 'name' ? dir : null}
              onSort={() => toggle('name')}
            >
              Name
            </TableHeaderCell>
            <TableHeaderCell>Owner</TableHeaderCell>
            <TableHeaderCell
              numeric
              sortDirection={key === 'count' ? dir : null}
              onSort={() => toggle('count')}
            >
              Count
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.name} interactive>
              <TableCell>{r.name}</TableCell>
              <TableCell>{r.owner}</TableCell>
              <TableCell numeric>{r.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  },
};

export const Empty = {
  render: () => (
    <Table aria-label="Empty sample">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Owner</TableHeaderCell>
          <TableHeaderCell numeric>Count</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableEmptyRow colSpan={3}>Nothing here yet.</TableEmptyRow>
      </TableBody>
    </Table>
  ),
};
