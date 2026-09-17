import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from './Separator';

describe('Separator', () => {
  it('기본은 수평 separator다(aria-orientation은 기본값이라 생략)', () => {
    render(<Separator />);
    const el = screen.getByRole('separator');
    expect(el.getAttribute('aria-orientation')).toBeNull();
  });

  it('vertical이면 aria-orientation=vertical', () => {
    render(<Separator orientation="vertical" />);
    expect(screen.getByRole('separator').getAttribute('aria-orientation')).toBe('vertical');
  });

  it('orientation에 따라 클래스가 달라진다', () => {
    const { rerender } = render(<Separator data-testid="s" />);
    const horizontal = screen.getByTestId('s').className;
    rerender(<Separator data-testid="s" orientation="vertical" />);
    expect(screen.getByTestId('s').className).not.toBe(horizontal);
  });

  it('decorative면 role="none"이고 separator로 읽히지 않는다', () => {
    render(<Separator decorative orientation="vertical" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.getAttribute('role')).toBe('none');
    expect(el.getAttribute('aria-orientation')).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('className을 병합하고 나머지 props를 div에 넘긴다', () => {
    render(<Separator className="extra" id="sep" />);
    const el = screen.getByRole('separator');
    expect(el.className).toContain('extra');
    expect(el.className).not.toBe('extra');
    expect(el.id).toBe('sep');
  });
});
