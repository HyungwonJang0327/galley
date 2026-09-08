import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopBarChip } from './TopBarChip';

describe('TopBarChip', () => {
  it('children을 버튼으로 렌더하고 type 기본값은 button', () => {
    render(<TopBarChip>글</TopBarChip>);
    const btn = screen.getByRole('button', { name: '글' });
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('onClick을 호출한다', () => {
    const onClick = vi.fn();
    render(<TopBarChip onClick={onClick}>글</TopBarChip>);
    fireEvent.click(screen.getByRole('button', { name: '글' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('trailing을 렌더한다', () => {
    render(<TopBarChip trailing={<span>▾</span>}>Opus</TopBarChip>);
    expect(screen.getByText('▾')).toBeTruthy();
  });
});
