import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarItem } from './SidebarItem';

describe('SidebarItem', () => {
  it('기본은 <a>로 라벨을 렌더한다', () => {
    render(<SidebarItem label="큐" />);
    expect(screen.getByText('큐').closest('a')).toBeTruthy();
  });

  it('isActive면 aria-current=page를 붙인다', () => {
    render(<SidebarItem label="큐" isActive />);
    expect(screen.getByText('큐').closest('[aria-current="page"]')).toBeTruthy();
  });

  it('badge를 렌더한다', () => {
    render(<SidebarItem label="큐" badge={<span>3</span>} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('collapsed면 라벨·배지를 감추고 title에 라벨을 둔다', () => {
    const { container } = render(<SidebarItem label="큐" badge={<span>3</span>} collapsed />);
    expect(screen.queryByText('큐')).toBeNull();
    expect(screen.queryByText('3')).toBeNull();
    expect(container.querySelector('[title="큐"]')).toBeTruthy();
  });

  it('render 요소로 렌더하고 className을 병합한다', () => {
    render(<SidebarItem label="큐" render={<button className="own" />} />);
    const el = screen.getByRole('button', { name: '큐' });
    expect(el.className).toContain('own');
  });
});
