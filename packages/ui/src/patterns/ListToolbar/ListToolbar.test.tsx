import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListToolbar } from './ListToolbar';
import { ListToolbarTab } from './ListToolbarTab';

describe('ListToolbar', () => {
  it('tabs·search·filters 슬롯을 렌더한다', () => {
    render(
      <ListToolbar
        tabs={<span>탭</span>}
        search={<input aria-label="검색" />}
        filters={<span>필터</span>}
      />,
    );
    expect(screen.getByText('탭')).toBeTruthy();
    expect(screen.getByLabelText('검색')).toBeTruthy();
    expect(screen.getByText('필터')).toBeTruthy();
  });

  it('role=toolbar이고 className을 병합한다', () => {
    render(<ListToolbar className="own" tabs={<span>탭</span>} />);
    const el = screen.getByRole('toolbar');
    expect(el.className).toContain('own');
  });

  it('슬롯이 없으면 빈 영역을 그리지 않는다', () => {
    const { container } = render(<ListToolbar />);
    expect(container.querySelector('[role="toolbar"]')?.childElementCount).toBe(0);
  });
});

describe('ListToolbarTab', () => {
  it('기본은 <a>로 라벨을 렌더한다', () => {
    render(<ListToolbarTab label="첫째" />);
    expect(screen.getByText('첫째').closest('a')).toBeTruthy();
  });

  it('count를 라벨 옆에 렌더한다', () => {
    render(<ListToolbarTab label="첫째" count={3} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('count가 0이면 0을 그대로 보여준다', () => {
    render(<ListToolbarTab label="첫째" count={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('isActive면 aria-current=page를 붙인다', () => {
    render(<ListToolbarTab label="첫째" isActive />);
    expect(screen.getByText('첫째').closest('[aria-current="page"]')).toBeTruthy();
  });

  it('render 요소로 렌더하고 className을 병합한다', () => {
    render(<ListToolbarTab label="첫째" render={<button className="own" />} />);
    const el = screen.getByRole('button', { name: '첫째' });
    expect(el.className).toContain('own');
  });
});
