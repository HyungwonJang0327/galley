import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs } from './Tabs';
import type { TabItem } from './Tabs';

const ITEMS: TabItem[] = [
  { value: 'a', label: '첫째', count: 3, content: '첫째 내용' },
  { value: 'b', label: '둘째', content: '둘째 내용' },
  { value: 'c', label: '셋째', disabled: true },
];

describe('Tabs', () => {
  it('tablist·tab을 렌더하고 활성 탭만 selected다', () => {
    render(<Tabs value="a" onValueChange={() => {}} items={ITEMS} aria-label="구역" />);
    expect(screen.getByRole('tablist', { name: '구역' })).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false');
  });

  it('count를 라벨 옆에 보여준다(0도 표시)', () => {
    render(
      <Tabs value="a" onValueChange={() => {}} items={[{ value: 'a', label: '첫째', count: 0 }]} />,
    );
    expect(screen.getByRole('tab').textContent).toBe('첫째0');
  });

  it('활성 탭의 content만 보인다', () => {
    render(<Tabs value="b" onValueChange={() => {}} items={ITEMS} />);
    expect(screen.getByText('둘째 내용')).toBeTruthy();
    expect(screen.queryByText('첫째 내용')).toBeNull();
  });

  it('다른 탭을 누르면 onValueChange에 그 value', () => {
    const onChange = vi.fn();
    render(<Tabs value="a" onValueChange={onChange} items={ITEMS} />);
    fireEvent.click(screen.getByRole('tab', { name: '둘째' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('disabled 탭은 눌러도 바뀌지 않는다', () => {
    const onChange = vi.fn();
    render(<Tabs value="a" onValueChange={onChange} items={ITEMS} />);
    const tab = screen.getByRole('tab', { name: '셋째' });
    fireEvent.click(tab);
    expect(onChange).not.toHaveBeenCalled();
    expect(tab.hasAttribute('data-disabled')).toBe(true);
  });

  it('content가 없는 항목은 panel을 만들지 않는다', () => {
    render(<Tabs value="c" onValueChange={() => {}} items={ITEMS} />);
    expect(screen.queryByRole('tabpanel')).toBeNull();
  });
});
