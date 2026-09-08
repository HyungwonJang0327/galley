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
});
