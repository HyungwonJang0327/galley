import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';

describe('Breadcrumb', () => {
  it('nav(aria-label) 안 목록, 마지막만 aria-current=page, 구분 기호는 장식', () => {
    render(
      <Breadcrumb aria-label="현재 위치" items={[{ label: '설정' }, { label: '모델·비용' }]} />,
    );
    const nav = screen.getByRole('navigation', { name: '현재 위치' });
    const items = within(nav).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toBe('설정');
    expect(items[0]!.querySelector('[aria-current]')).toBeNull();
    const current = items[1]!.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe('모델·비용');
    // 구분 기호: 첫 항목 앞에는 없고, 둘째 앞에 하나(aria-hidden)
    expect(items[0]!.querySelector('svg')).toBeNull();
    expect(items[1]!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('render를 넘긴 상위 항목은 그 요소(링크)로 그리고 className·onClick을 병합한다', () => {
    const onClick = vi.fn();
    render(
      <Breadcrumb
        items={[
          { label: '홈', render: <a href="/" className="own" onClick={onClick} /> },
          { label: '설정' },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: '홈' });
    expect(link.getAttribute('href')).toBe('/');
    expect(link.className).toContain('own');
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('마지막 항목은 render를 넘겨도 링크가 아니다(현재 페이지)', () => {
    render(<Breadcrumb items={[{ label: '설정' }, { label: '모델', render: <a href="/x" /> }]} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('모델').getAttribute('aria-current')).toBe('page');
  });

  it('기본 aria-label은 Breadcrumb, className은 nav에 병합, 항목 하나면 그것이 현재', () => {
    render(<Breadcrumb className="own" items={[{ label: '홈' }]} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(nav.className).toContain('own');
    expect(screen.getByText('홈').getAttribute('aria-current')).toBe('page');
  });
});
