import { describe, it, expect, vi } from 'vitest';
import { FormField } from '../FormField';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('라벨이 접근성 이름이 되고 checked 상태를 읽어준다', () => {
    render(
      <Checkbox checked onCheckedChange={() => {}}>
        승인된 것만
      </Checkbox>,
    );
    const box = screen.getByRole('checkbox', { name: '승인된 것만' });
    expect(box.getAttribute('aria-checked')).toBe('true');
  });

  it('상자를 누르면 반대 값으로 onCheckedChange', () => {
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onCheckedChange={onChange}>
        항목
      </Checkbox>,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('라벨 텍스트를 눌러도 토글된다', () => {
    const onChange = vi.fn();
    render(
      <Checkbox checked onCheckedChange={onChange}>
        항목
      </Checkbox>,
    );
    fireEvent.click(screen.getByText('항목'));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('disabled면 눌러도 바뀌지 않는다', () => {
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onCheckedChange={onChange} disabled>
        항목
      </Checkbox>,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('항목'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox').hasAttribute('data-disabled')).toBe(true);
  });

  it('indeterminate면 aria-checked=mixed', () => {
    render(<Checkbox checked={false} onCheckedChange={() => {}} indeterminate aria-label="일부" />);
    expect(screen.getByRole('checkbox', { name: '일부' }).getAttribute('aria-checked')).toBe(
      'mixed',
    );
  });

  it('라벨 없이 aria-label만으로도 이름이 잡힌다', () => {
    render(<Checkbox checked={false} onCheckedChange={() => {}} aria-label="이름만" />);
    expect(screen.getByRole('checkbox', { name: '이름만' })).toBeTruthy();
  });

  it('이름 없이 FormField 밖에서 쓰면 개발 모드 경고, 이름이 있거나 FormField 안이면 없다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = render(<Checkbox checked={false} onCheckedChange={() => {}} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('Checkbox');
    unmount();
    warn.mockClear();
    const second = render(
      <Checkbox checked={false} onCheckedChange={() => {}} aria-label="이름" />,
    );
    expect(warn).not.toHaveBeenCalled();
    second.unmount();
    render(
      <FormField label="필드">
        <Checkbox checked={false} onCheckedChange={() => {}} />
      </FormField>,
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('키보드 Space로 토글된다', () => {
    const onChange = vi.fn();
    render(
      <Checkbox checked={false} onCheckedChange={onChange}>
        항목
      </Checkbox>,
    );
    const el = screen.getByRole('checkbox');
    fireEvent.keyDown(el, { key: ' ' });
    fireEvent.keyUp(el, { key: ' ' });
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('className을 라벨 요소에 병합한다', () => {
    render(
      <Checkbox checked={false} onCheckedChange={() => {}} className="own">
        항목
      </Checkbox>,
    );
    expect(screen.getByText('항목').closest('label')?.className).toContain('own');
  });
});
