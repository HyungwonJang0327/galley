'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarGroup, SidebarItem } from '@galley/ui';
import { NAV_GROUPS, isNavItemActive } from '../../../lib/navigation';

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="주 메뉴">
      {NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.label} label={group.label}>
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
                isActive={isNavItemActive(pathname, item)}
                render={link}
              />
            );
          })}
        </SidebarGroup>
      ))}
    </nav>
  );
}
