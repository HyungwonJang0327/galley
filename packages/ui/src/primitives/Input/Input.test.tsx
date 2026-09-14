import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('textbox로 렌더되고 placeholder·aria-label을 전달한다', () => {
    render(<Input aria-label="지시" placeholder="입력하세요" />);
    const input = screen.getByRole('textbox', { name: '지시' });
    expect(input.getAttribute('placeholder')).toBe('입력하세요');
  });

  it('입력하면 onChange가 값을 받는다', () => {
    const onChange = vi.fn();
    render(<Input aria-label="지시" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '부드럽게' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('부드럽게');
  });

  it('disabled면 입력할 수 없다', () => {
    render(<Input aria-label="지시" disabled />);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
  });

  it('invalid면 aria-invalid, 아니면 속성 자체가 없다', () => {
    const { rerender } = render(<Input aria-label="지시" invalid />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
    rerender(<Input aria-label="지시" />);
    expect(screen.getByRole('textbox').hasAttribute('aria-invalid')).toBe(false);
  });

  it('className을 병합한다', () => {
    render(<Input aria-label="지시" className="extra" />);
    expect(screen.getByRole('textbox').classList.contains('extra')).toBe(true);
  });
});
