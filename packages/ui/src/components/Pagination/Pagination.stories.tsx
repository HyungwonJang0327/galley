// Storybook 스토리(CSF3) — `pnpm --filter galley-ui storybook`. 샘플 문구는 도메인 무지(decisions/docs-site.md).
import { useState } from 'react';
import { Pagination } from './Pagination';

const meta = {
  title: 'Components/Pagination',
  component: Pagination,
};
export default meta;

function Controlled({
  pageCount,
  initial = 1,
  ...rest
}: {
  pageCount: number;
  initial?: number;
  showFirstLast?: boolean;
  siblingCount?: number;
}) {
  const [page, setPage] = useState(initial);
  return <Pagination page={page} pageCount={pageCount} onPageChange={setPage} {...rest} />;
}

export const Short = { render: () => <Controlled pageCount={5} /> };
export const Long = { render: () => <Controlled pageCount={24} initial={12} /> };
export const AtEnd = { render: () => <Controlled pageCount={24} initial={24} /> };
export const FirstLast = { render: () => <Controlled pageCount={24} initial={7} showFirstLast /> };
export const Siblings2 = {
  render: () => <Controlled pageCount={24} initial={12} siblingCount={2} />,
};
export const Disabled = {
  args: { page: 3, pageCount: 10, disabled: true, onPageChange: () => {} },
};
