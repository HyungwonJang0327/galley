import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { SidebarProvider } from './SidebarProvider';

// Next 훅은 라우터 컨텍스트가 필요하므로 테스트에서는 pathname만 고정한다.
vi.mock('next/navigation', () => ({ usePathname: () => '/runs' }));

describe('Sidebar', () => {
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
