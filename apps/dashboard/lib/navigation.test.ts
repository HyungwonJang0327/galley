import { describe, it, expect } from 'vitest';
import { Inbox, ExternalLink } from 'lucide-react';
import { HOME_ITEM, isNavItemActive, type NavItem, breadcrumbFor } from './navigation';

const queue: NavItem = { label: '큐', href: '/queue', icon: Inbox };
const zenn: NavItem = {
  label: 'Zenn 열기',
  href: 'https://zenn.dev',
  icon: ExternalLink,
  external: true,
};

describe('breadcrumbFor', () => {
  it('메뉴 항목 경로는 [그룹(링크 없음), 항목(현재)]', () => {
    expect(breadcrumbFor('/settings/model')).toEqual([
      { label: '설정' },
      { label: '모델·비용', href: '/settings/model' },
    ]);
    expect(breadcrumbFor('/runs/history')).toEqual([
      { label: '실행' },
      { label: '이력', href: '/runs/history' },
    ]);
  });

  it('홈·메뉴에 없는 경로·외부 링크는 빈 배열', () => {
    expect(breadcrumbFor('/')).toEqual([]);
    expect(breadcrumbFor('/runs/history?x=1')).toEqual([]);
    expect(breadcrumbFor('https://zenn.dev')).toEqual([]);
  });
});

describe('isNavItemActive', () => {
  it('pathname이 href와 같으면 활성', () => {
    expect(isNavItemActive('/queue', queue)).toBe(true);
  });

  it('하위 경로·쿼리 없는 다른 경로는 비활성(정확히 일치할 때만)', () => {
    expect(isNavItemActive('/queue/candidates', queue)).toBe(false);
    expect(isNavItemActive('/runs', queue)).toBe(false);
  });

  it('홈은 루트에서만 활성(다른 화면에서 켜지지 않는다)', () => {
    expect(isNavItemActive('/', HOME_ITEM)).toBe(true);
    expect(isNavItemActive('/queue', HOME_ITEM)).toBe(false);
  });

  it('외부 링크는 pathname이 같아도 항상 비활성', () => {
    expect(isNavItemActive('https://zenn.dev', zenn)).toBe(false);
  });
});
