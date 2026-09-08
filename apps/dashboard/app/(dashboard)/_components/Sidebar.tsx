'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarGroup, SidebarItem } from '@galley/ui';
import { NAV_GROUPS, isNavItemActive } from '../../../lib/navigation';
import { useSidebarCollapse } from './SidebarProvider';

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed } = useSidebarCollapse();
  return (
    <nav aria-label="주 메뉴">
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
                badge={item.badge}
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
