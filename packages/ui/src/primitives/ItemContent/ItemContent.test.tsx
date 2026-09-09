import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ItemContent } from './ItemContent';

describe('ItemContent', () => {
  it('label만 렌더한다', () => {
    render(<ItemContent label="라벨" />);
    expect(screen.getByText('라벨')).toBeTruthy();
  });

  it('label·description·meta를 모두 렌더한다', () => {
    render(<ItemContent label="라벨" description="보조" meta="1 / 5" />);
    expect(screen.getByText('라벨')).toBeTruthy();
    expect(screen.getByText('보조')).toBeTruthy();
    expect(screen.getByText('1 / 5')).toBeTruthy();
  });

  it('description·meta가 없으면 빈 요소를 만들지 않는다', () => {
    const { container } = render(<ItemContent label="라벨" />);
    const root = container.firstElementChild as HTMLElement;
    // [본문 열]만 — 우측 메타 없음
    expect(root.children).toHaveLength(1);
    expect(root.children[0]?.children).toHaveLength(1);
  });

  it('label은 ReactNode를 받는다(Select.ItemText 등으로 감쌀 수 있다)', () => {
    render(<ItemContent label={<em>강조 라벨</em>} />);
    expect(screen.getByText('강조 라벨').tagName).toBe('EM');
  });
});
