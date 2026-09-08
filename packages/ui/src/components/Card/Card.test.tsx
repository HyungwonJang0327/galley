import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('children을 렌더한다', () => {
    render(<Card>내용</Card>);
    expect(screen.getByText('내용')).toBeTruthy();
  });

  it('추가 className을 병합한다', () => {
    const { container } = render(<Card className="extra">내용</Card>);
    expect((container.firstChild as HTMLElement).className).toContain('extra');
  });
});
