import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('세 슬롯(topBar·sidebar·children)을 모두 렌더한다', () => {
    render(
      <AppShell topBar={<div>상단</div>} sidebar={<nav>메뉴</nav>}>
        <p>본문</p>
      </AppShell>,
    );
    expect(screen.getByText('상단')).toBeTruthy();
    expect(screen.getByRole('navigation')).toBeTruthy();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('sidebarCollapsed일 때 data-collapsed를 표시한다', () => {
    const { container } = render(
      <AppShell topBar={null} sidebar={null} sidebarCollapsed>
        x
      </AppShell>,
    );
    expect(container.querySelector('[data-collapsed="true"]')).toBeTruthy();
  });

  it('두 행 구조: 루트 아래 header, 그다음 sidebar(aside)와 content(main)를 감싸는 행 하나', () => {
    const { container } = render(
      <AppShell topBar={<div>상단</div>} sidebar={<nav>메뉴</nav>}>
        <p>본문</p>
      </AppShell>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.children).toHaveLength(2);
    expect(root.children[0]?.tagName).toBe('HEADER');
    const body = root.children[1] as HTMLElement;
    expect(body.children).toHaveLength(2);
    expect(body.children[0]?.tagName).toBe('ASIDE');
    expect(body.children[1]?.tagName).toBe('MAIN');
  });
});
