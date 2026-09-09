import { describe, it, expect } from 'vitest';
import { Inbox, ExternalLink } from 'lucide-react';
import { isNavItemActive, type NavItem } from './navigation';

const queue: NavItem = { label: '큐', href: '/queue', icon: Inbox };
const zenn: NavItem = {
  label: 'Zenn 열기',
  href: 'https://zenn.dev',
  icon: ExternalLink,
  external: true,
};

describe('isNavItemActive', () => {
  it('pathname이 href와 같으면 활성', () => {
    expect(isNavItemActive('/queue', queue)).toBe(true);
  });

  it('하위 경로·쿼리 없는 다른 경로는 비활성(정확히 일치할 때만)', () => {
    expect(isNavItemActive('/queue/candidates', queue)).toBe(false);
    expect(isNavItemActive('/runs', queue)).toBe(false);
  });

  it('외부 링크는 pathname이 같아도 항상 비활성', () => {
    expect(isNavItemActive('https://zenn.dev', zenn)).toBe(false);
  });
});
