'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarGroup, SidebarItem } from '@galley/ui';
import { HOME_ITEM, NAV_GROUPS, isNavItemActive } from '../../../lib/navigation';
import { useSidebarCollapse } from './SidebarProvider';
import styles from './Sidebar.module.css';

/** 경로별 배지 값. 서버(layout.tsx)가 홈 타일과 같은 소스로 조회해 넘긴다. 0은 표시하지 않는다. */
export type SidebarBadges = Partial<Record<string, number>>;

export function Sidebar({ badges }: { badges?: SidebarBadges }) {
  const pathname = usePathname();
  const { collapsed } = useSidebarCollapse();
  const HomeIcon = HOME_ITEM.icon;
  const badgeFor = (href: string) => {
    const count = badges?.[href];
    return count !== undefined && count > 0 ? count : undefined;
  };
  return (
    <nav aria-label="주 메뉴">
      {/* 홈은 정보 종류가 아니라 시작점이라 그룹 밖에 단독으로 둔다(구분선으로 메뉴와 나눔). */}
      <div className={styles.home}>
        <SidebarItem
          label={HOME_ITEM.label}
          icon={<HomeIcon size={16} aria-hidden="true" />}
          isActive={isNavItemActive(pathname, HOME_ITEM)}
          collapsed={collapsed}
          render={<Link href={HOME_ITEM.href} />}
        />
      </div>
      {NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.label} label={group.label} collapsed={collapsed}>
          {group.items.map((item) => {
            const Icon = item.icon;
            const icon = <Icon size={16} aria-hidden="true" />;
            const link = item.external ? (
              <a href={item.href} target="_blank" rel="noreferrer noopener" />
            ) : (
              <Link href={item.href} />
            );
            return (
              <SidebarItem
                key={item.href}
                label={item.label}
                icon={icon}
                badge={badgeFor(item.href) ?? item.badge}
                isActive={isNavItemActive(pathname, item)}
                collapsed={collapsed}
                render={link}
              />
            );
          })}
        </SidebarGroup>
      ))}
    </nav>
  );
}
