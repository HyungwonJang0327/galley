import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('라벨과 값을 보여 준다', () => {
    render(<StatTile label="대기" value={3} />);

    expect(screen.getByText('대기')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('href를 주면 링크가 된다', () => {
    render(<StatTile label="대기" value={3} href="/queue" />);

    const link = screen.getByRole('link', { name: /대기/ });
    expect(link.getAttribute('href')).toBe('/queue');
  });

  it('render 요소에 className을 병합해 그 요소로 렌더한다', () => {
    render(
      <StatTile
        label="대기"
        value={3}
        render={<a href="/queue" data-testid="tile" className="own" />}
      />,
    );

    const tile = screen.getByTestId('tile');
    expect(tile.tagName).toBe('A');
    expect(tile.className).toContain('own');
    expect(tile.textContent).toContain('대기');
  });

  it('링크가 아니면 화살표를 그리지 않는다', () => {
    const { container } = render(<StatTile label="비용" value="—" />);

    expect(container.querySelector('svg')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('링크면 화살표를 그린다(장식이라 접근성 트리에서 숨김)', () => {
    const { container } = render(<StatTile label="대기" value={3} href="/queue" />);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('tone에 따라 값 색 클래스가 바뀐다', () => {
    const { container: base } = render(<StatTile label="대기" value={0} />);
    const { container: muted } = render(<StatTile label="대기" value={0} tone="muted" />);
    const { container: warning } = render(<StatTile label="승인 대기" value={2} tone="warning" />);

    expect(base.firstElementChild?.className).not.toBe(muted.firstElementChild?.className);
    expect(muted.firstElementChild?.className).not.toBe(warning.firstElementChild?.className);
  });

  it('icon 슬롯을 라벨 앞에 넣는다', () => {
    render(<StatTile label="대기" value={3} icon={<span data-testid="icon" />} />);

    expect(screen.getByTestId('icon')).toBeTruthy();
  });
});
