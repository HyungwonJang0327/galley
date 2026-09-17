import { createRef } from 'react';
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

  it('decorative 수평(기본 방향)도 role="none"이다', () => {
    render(<Separator decorative data-testid="s" />);
    expect(screen.getByTestId('s').getAttribute('role')).toBe('none');
    expect(screen.queryByRole('separator')).toBeNull();
  });

  it('타입을 우회해 넘어온 role·aria-orientation을 덮어쓴다', () => {
    const smuggled = { role: 'button', 'aria-orientation': 'vertical' } as object;
    const { rerender } = render(<Separator data-testid="s" {...smuggled} />);
    expect(screen.getByTestId('s').getAttribute('role')).toBe('separator');
    expect(screen.getByTestId('s').getAttribute('aria-orientation')).toBeNull();

    rerender(<Separator decorative data-testid="s" {...smuggled} />);
    expect(screen.getByTestId('s').getAttribute('role')).toBe('none');
    expect(screen.getByTestId('s').getAttribute('aria-orientation')).toBeNull();
  });

  it('ref를 div에 넘긴다', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Separator ref={ref} />);
    expect(ref.current).toBe(screen.getByRole('separator'));
  });

  it('className을 병합하고 나머지 props를 div에 넘긴다', () => {
    render(<Separator className="extra" id="sep" />);
    const el = screen.getByRole('separator');
    expect(el.className).toContain('extra');
    expect(el.className).not.toBe('extra');
    expect(el.id).toBe('sep');
  });
});
