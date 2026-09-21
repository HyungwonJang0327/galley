import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('children을 렌더한다', () => {
    render(<Badge>대기</Badge>);
    expect(screen.getByText('대기')).toBeTruthy();
  });

  it.each(['neutral', 'info', 'warning', 'success', 'danger'] as const)('tone=%s 렌더', (tone) => {
    render(<Badge tone={tone}>{tone}</Badge>);
    expect(screen.getByText(tone)).toBeTruthy();
  });

  it('pulse가 클래스를 추가한다', () => {
    const { rerender } = render(<Badge>x</Badge>);
    const before = screen.getByText('x').className;
    rerender(<Badge pulse>x</Badge>);
    const after = screen.getByText('x').className;
    expect(after).not.toBe(before);
  });

  it('className을 병합하고 tone마다 클래스가 다르다', () => {
    const { rerender } = render(<Badge className="own">x</Badge>);
    const el = screen.getByText('x');
    expect(el.className).toContain('own');
    const neutral = el.className;
    rerender(
      <Badge className="own" tone="danger">
        x
      </Badge>,
    );
    expect(screen.getByText('x').className).not.toBe(neutral);
  });
});
