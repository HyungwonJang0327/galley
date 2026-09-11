import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Menu } from './Menu';
import type { MenuEntry } from './Menu';

const ITEMS: MenuEntry[] = [
  { id: 'a', label: '첫째', description: '보조 A', meta: '1 / 5' },
  { id: 'b', label: '둘째' },
  { type: 'separator' },
  { id: 'c', label: '셋째', disabled: true, disabledReason: '사용 불가 사유' },
];

const TRIGGER = <button type="button">메뉴</button>;

function openMenu() {
  const trigger = screen.getByRole('button', { name: '메뉴' });
  fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  return trigger;
}

/** 실제 마우스 순서: pointerdown → click (Base UI는 트리거를 연 press의 잔여 click을 거른다). */
function press(element: HTMLElement) {
  fireEvent.pointerDown(element, { pointerType: 'mouse', button: 0 });
  fireEvent.click(element);
}

describe('Menu', () => {
  it('닫힌 상태에서는 트리거만 렌더하고 menu는 없다', () => {
    render(<Menu trigger={TRIGGER} items={ITEMS} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: '메뉴' })).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('트리거를 누르면 항목·description·meta·구분선이 보인다', async () => {
    render(<Menu trigger={TRIGGER} items={ITEMS} onSelect={() => {}} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(screen.getByRole('separator')).toBeTruthy();
    expect(screen.getByText('보조 A')).toBeTruthy();
    expect(screen.getByText('1 / 5')).toBeTruthy();
  });

  it('disabled 항목은 aria-disabled이고 disabledReason이 title로 붙는다', async () => {
    render(<Menu trigger={TRIGGER} items={ITEMS} onSelect={() => {}} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    const disabled = screen.getByRole('menuitem', { name: /셋째/ });
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    expect(disabled.getAttribute('title')).toBe('사용 불가 사유');
  });

  it('항목을 고르면 onSelect에 id를 넘기고 메뉴를 닫는다', async () => {
    const onSelect = vi.fn();
    render(<Menu trigger={TRIGGER} items={ITEMS} onSelect={onSelect} />);
    const trigger = openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    press(screen.getByRole('menuitem', { name: /둘째/ }));
    expect(onSelect).toHaveBeenCalledWith('b');
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).not.toBe('true'));
  });

  it('disabled 항목을 눌러도 onSelect를 부르지 않는다', async () => {
    const onSelect = vi.fn();
    render(<Menu trigger={TRIGGER} items={ITEMS} onSelect={onSelect} />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    press(screen.getByRole('menuitem', { name: /셋째/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('className을 popup에 병합한다', async () => {
    render(<Menu trigger={TRIGGER} items={ITEMS} onSelect={() => {}} className="own" />);
    openMenu();
    await waitFor(() => expect(screen.getByRole('menu').className).toContain('own'));
  });
});
