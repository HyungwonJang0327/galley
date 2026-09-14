import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('textbox로 렌더되고 placeholder·rows 기본 3을 가진다', () => {
    render(<Textarea aria-label="지시" placeholder="입력하세요" />);
    const el = screen.getByRole('textbox', { name: '지시' }) as HTMLTextAreaElement;
    expect(el.tagName).toBe('TEXTAREA');
    expect(el.getAttribute('placeholder')).toBe('입력하세요');
    expect(el.getAttribute('rows')).toBe('3');
  });

  it('rows를 바꿀 수 있다', () => {
    render(<Textarea aria-label="지시" rows={6} />);
    expect(screen.getByRole('textbox').getAttribute('rows')).toBe('6');
  });

  it('입력하면 onChange가 값을 받는다', () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="지시" onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '첫 줄\n둘째 줄' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('첫 줄\n둘째 줄');
  });

  it('disabled면 입력할 수 없다', () => {
    render(<Textarea aria-label="지시" disabled />);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('invalid면 aria-invalid, 아니면 속성 자체가 없다', () => {
    const { rerender } = render(<Textarea aria-label="지시" invalid />);
    expect(screen.getByRole('textbox').getAttribute('aria-invalid')).toBe('true');
    rerender(<Textarea aria-label="지시" />);
    expect(screen.getByRole('textbox').hasAttribute('aria-invalid')).toBe(false);
  });

  it('className을 병합한다', () => {
    render(<Textarea aria-label="지시" className="extra" />);
    expect(screen.getByRole('textbox').classList.contains('extra')).toBe(true);
  });
});
