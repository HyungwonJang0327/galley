import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { SidebarProvider } from './SidebarProvider';

// Next 훅은 라우터 컨텍스트가 필요하므로 테스트에서는 pathname만 고정한다.
vi.mock('next/navigation', () => ({ usePathname: () => '/runs' }));

describe('Sidebar', () => {
  it('맨 위에 홈 항목(루트 링크)이 있고, 다른 화면에서는 활성이 아니다', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>,
    );
    const home = screen.getByRole('link', { name: '홈' });
    expect(home.getAttribute('href')).toBe('/');
    expect(home.getAttribute('aria-current')).toBeNull();
    // 그룹 밖 단독 항목이라 첫 번째 링크다.
    expect(screen.getAllByRole('link')[0]).toBe(home);
  });

  it('배지 값이 있으면 항목에 표시하고, 0은 표시하지 않는다', () => {
    render(
      <SidebarProvider>
        <Sidebar badges={{ '/queue': 3, '/runs': 0 }} />
      </SidebarProvider>,
    );
    expect(screen.getByRole('link', { name: /큐/ }).textContent).toContain('3');
    expect(screen.getByRole('link', { name: /^실행/ }).textContent).not.toContain('0');
  });

  it('현재 URL과 같은 항목만 aria-current="page"', () => {
    render(
      <SidebarProvider>
        <Sidebar />
      </SidebarProvider>,
    );
    expect(screen.getByRole('link', { name: '실행' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '이력' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: '큐' }).getAttribute('aria-current')).toBeNull();
  });
});
