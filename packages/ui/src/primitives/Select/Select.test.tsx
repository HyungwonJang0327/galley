import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Select } from './Select';
import type { SelectItem } from './Select';

const ITEMS: SelectItem[] = [
  { value: 'a', label: '첫째', description: '보조 A', trailing: '1 / 5' },
  { value: 'b', label: '둘째', description: '보조 B', trailing: '2 / 10' },
  { value: 'c', label: '셋째', disabled: true, disabledReason: '사용 불가 사유' },
];

function openSelect() {
  const trigger = screen.getByRole('combobox');
  fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 });
  fireEvent.mouseDown(trigger, { button: 0 });
  fireEvent.click(trigger);
  return trigger;
}

describe('Select', () => {
  it('value가 null이면 placeholder를 보여준다', () => {
    render(
      <Select
        value={null}
        onValueChange={() => {}}
        items={ITEMS}
        placeholder="선택하세요"
        aria-label="옵션"
      />,
    );
    expect(screen.getByRole('combobox', { name: '옵션' }).textContent).toContain('선택하세요');
  });

  it('value가 있으면 해당 항목의 label을 보여준다', () => {
    render(<Select value="b" onValueChange={() => {}} items={ITEMS} aria-label="옵션" />);
    expect(screen.getByRole('combobox').textContent).toContain('둘째');
  });

  it('트리거를 누르면 항목 목록이 열리고 description·trailing이 보인다', async () => {
    render(<Select value="a" onValueChange={() => {}} items={ITEMS} aria-label="옵션" />);
    openSelect();
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByText('보조 B')).toBeTruthy();
    expect(screen.getByText('2 / 10')).toBeTruthy();
  });

  it('disabled 항목은 aria-disabled이고 disabledReason이 title로 붙는다', async () => {
    render(<Select value="a" onValueChange={() => {}} items={ITEMS} aria-label="옵션" />);
    openSelect();
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
    const disabled = screen.getByRole('option', { name: /셋째/ });
    expect(disabled.getAttribute('aria-disabled')).toBe('true');
    expect(disabled.getAttribute('title')).toBe('사용 불가 사유');
  });

  it('항목을 고르면 onValueChange에 value를 넘긴다', async () => {
    const onValueChange = vi.fn();
    render(<Select value="a" onValueChange={onValueChange} items={ITEMS} aria-label="옵션" />);
    openSelect();
    await waitFor(() => expect(screen.getByRole('listbox')).toBeTruthy());
    const option = screen.getByRole('option', { name: /둘째/ });
    // 실제 마우스 순서: pointerdown → click (Base UI는 트리거를 연 press의 잔여 click을 거른다)
    fireEvent.pointerDown(option, { pointerType: 'mouse', button: 0 });
    fireEvent.click(option);
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('disabled면 트리거가 비활성이다', () => {
    render(<Select value="a" onValueChange={() => {}} items={ITEMS} aria-label="옵션" disabled />);
    const trigger = screen.getByRole('combobox');
    expect(
      trigger.getAttribute('aria-disabled') === 'true' || trigger.hasAttribute('disabled'),
    ).toBe(true);
  });
});
