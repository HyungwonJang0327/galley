import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActionBar } from './ActionBar';

describe('ActionBar', () => {
  it('children과 actions를 렌더한다', () => {
    render(
      <ActionBar actions={<button type="button">승인</button>}>
        <input aria-label="지시" />
      </ActionBar>,
    );
    expect(screen.getByLabelText('지시')).toBeTruthy();
    expect(screen.getByRole('button', { name: '승인' })).toBeTruthy();
  });

  it('label을 주면 group으로 노출한다', () => {
    render(<ActionBar label="하단 바">내용</ActionBar>);
    expect(screen.getByRole('group', { name: '하단 바' })).toBeTruthy();
  });

  it('actions가 없어도 렌더한다', () => {
    render(<ActionBar>내용</ActionBar>);
    expect(screen.getByText('내용')).toBeTruthy();
  });

  it('className을 병합한다', () => {
    const { container } = render(<ActionBar className="own">내용</ActionBar>);
    expect(container.firstElementChild?.className).toContain('own');
  });
});
