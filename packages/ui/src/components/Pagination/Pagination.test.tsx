import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Pagination, paginationRange } from './Pagination';

describe('paginationRange', () => {
  it('전부 들어가면 생략 없음, 길면 처음·현재±1·끝 + 생략, 딱 1이 비면 숫자를 그대로', () => {
    expect(paginationRange(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(paginationRange(1, 8)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 8]);
    expect(paginationRange(5, 8)).toEqual([1, 'ellipsis', 4, 5, 6, 7, 8]); // 2·3 두 칸이 비면 생략, 폭은 7로 같다
    expect(paginationRange(12, 24)).toEqual([1, 'ellipsis', 11, 12, 13, 'ellipsis', 24]);
    expect(paginationRange(24, 24)).toEqual([1, 'ellipsis', 20, 21, 22, 23, 24]);
    expect(paginationRange(3, 24)).toEqual([1, 2, 3, 4, 5, 'ellipsis', 24]);
  });

  it('siblingCount·boundaryCount를 반영하고, 범위 밖 page는 안쪽으로, pageCount 0은 빈 배열', () => {
    expect(paginationRange(12, 24, { siblingCount: 2 })).toEqual([
      1,
      'ellipsis',
      10,
      11,
      12,
      13,
      14,
      'ellipsis',
      24,
    ]);
    expect(paginationRange(12, 24, { boundaryCount: 2 })).toEqual([
      1,
      2,
      'ellipsis',
      11,
      12,
      13,
      'ellipsis',
      23,
      24,
    ]);
    expect(paginationRange(99, 24)).toEqual(paginationRange(24, 24));
    expect(paginationRange(-3, 24)).toEqual(paginationRange(1, 24));
    expect(paginationRange(1, 0)).toEqual([]);
  });

  it('양끝에서 항목 수가 같다(폭이 흔들리지 않게)', () => {
    const widths = [1, 2, 3, 12, 22, 23, 24].map((p) => paginationRange(p, 24).length);
    expect(new Set(widths).size).toBe(1);
  });
});

describe('Pagination', () => {
  it('nav(aria-label) 안 목록, 현재 페이지만 aria-current, 생략 기호는 장식, 첫 페이지에서 이전은 비활성', () => {
    render(<Pagination page={1} pageCount={24} onPageChange={() => {}} aria-label="페이지 이동" />);
    const nav = screen.getByRole('navigation', { name: '페이지 이동' });
    expect(within(nav).getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(
      within(nav)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-current')),
    ).toHaveLength(1);
    expect(
      (within(nav).getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (within(nav).getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    const ellipsis = nav.querySelector('span[aria-hidden="true"]');
    expect(ellipsis?.textContent).toBe('…');
  });

  it('페이지·이전·다음 클릭이 onPageChange를 부르고, 현재 페이지 클릭은 부르지 않는다', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageCount={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Page 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onPageChange.mock.calls.map((c) => c[0])).toEqual([5, 2, 4]);
  });

  it('showFirstLast는 처음·끝 버튼을 더하고, 마지막 페이지에서는 다음·끝이 비활성', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={10} pageCount={10} onPageChange={onPageChange} showFirstLast />);
    expect((screen.getByRole('button', { name: 'Last page' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'First page' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('labels로 접근성 이름을 바꾸고, disabled면 전부 비활성, pageCount 0이면 아무것도 없다', () => {
    const { container, rerender } = render(
      <Pagination
        page={2}
        pageCount={3}
        onPageChange={() => {}}
        disabled
        labels={{ previous: '이전', next: '다음', page: (n) => `${n}페이지` }}
      />,
    );
    expect(screen.getByRole('button', { name: '2페이지' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getAllByRole('button').every((b) => (b as HTMLButtonElement).disabled)).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: '이전' })).toBeTruthy();
    rerender(<Pagination page={1} pageCount={0} onPageChange={() => {}} />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('범위 밖 page는 안쪽으로 맞춘다', () => {
    render(<Pagination page={50} pageCount={4} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Page 4' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});
