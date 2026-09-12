import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('메시지를 보여 준다', () => {
    render(<EmptyState message="대기 중인 주제가 없습니다." />);

    expect(screen.getByText('대기 중인 주제가 없습니다.')).toBeTruthy();
  });

  it('action이 없으면 액션 영역을 그리지 않는다', () => {
    render(<EmptyState message="비었습니다." />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('action 슬롯을 메시지 아래에 넣는다', () => {
    render(<EmptyState message="비었습니다." action={<button type="button">후보 보기</button>} />);

    expect(screen.getByRole('button', { name: '후보 보기' })).toBeTruthy();
  });

  it('className을 병합한다', () => {
    const { container } = render(<EmptyState message="비었습니다." className="own" />);

    expect(container.firstElementChild?.className).toContain('own');
  });
});
