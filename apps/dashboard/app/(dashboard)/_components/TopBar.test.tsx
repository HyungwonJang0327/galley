import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopBar } from './TopBar';
import { SidebarProvider } from './SidebarProvider';

const renderTopBar = (workerAlive: boolean) =>
  render(
    <SidebarProvider>
      <TopBar workerAlive={workerAlive} />
    </SidebarProvider>,
  );

describe('TopBar 워커 생존 표시', () => {
  it('살아 있으면 "워커 켜짐"', () => {
    renderTopBar(true);
    const label = screen.getByText('워커 켜짐');
    expect(label.getAttribute('data-alive')).toBe('true');
    expect(screen.queryByText('워커 꺼짐')).toBeNull();
  });

  it('heartbeat가 끊겼으면 "워커 꺼짐" — 색만으로 전하지 않는다', () => {
    renderTopBar(false);
    expect(screen.getByText('워커 꺼짐').getAttribute('data-alive')).toBe('false');
  });
});
