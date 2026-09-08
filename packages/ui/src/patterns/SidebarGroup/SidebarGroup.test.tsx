import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarGroup } from './SidebarGroup';

describe('SidebarGroup', () => {
  it('라벨과 자식을 렌더한다', () => {
    render(
      <SidebarGroup label="주제">
        <a>큐</a>
      </SidebarGroup>,
    );
    expect(screen.getByRole('group', { name: '주제' })).toBeTruthy();
    expect(screen.getByText('주제')).toBeTruthy();
    expect(screen.getByText('큐')).toBeTruthy();
  });

  it('접힘 시 라벨 텍스트를 감추되 접근성 이름은 유지한다', () => {
    render(
      <SidebarGroup label="주제" collapsed>
        <a>큐</a>
      </SidebarGroup>,
    );
    expect(screen.getByRole('group', { name: '주제' })).toBeTruthy();
    expect(screen.queryByText('주제')).toBeNull();
  });
});
