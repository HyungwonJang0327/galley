import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('children을 렌더한다', () => {
    render(<Badge>대기</Badge>);
    expect(screen.getByText('대기')).toBeTruthy();
  });

  it.each(['neutral', 'info', 'warning', 'success', 'danger'] as const)(
    'variant=%s 렌더',
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeTruthy();
    },
  );

  it('pulse가 클래스를 추가한다', () => {
    const { rerender } = render(<Badge>x</Badge>);
    const before = screen.getByText('x').className;
    rerender(<Badge pulse>x</Badge>);
    const after = screen.getByText('x').className;
    expect(after).not.toBe(before);
  });
});
