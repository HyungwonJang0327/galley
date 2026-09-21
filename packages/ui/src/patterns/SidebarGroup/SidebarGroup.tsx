import type { ReactNode } from 'react';
import styles from './SidebarGroup.module.css';

export interface SidebarGroupProps {
  /** 그룹 라벨(접힘 시 시각적으로 감춤, 접근성용으로 유지). */
  label: string;
  /** 접힘 상태. */
  collapsed?: boolean;
  /** 그룹 항목(SidebarItem 등). */
  children: ReactNode;
  /** 루트(role=group)에 병합. */
  className?: string;
}

export function SidebarGroup({ label, collapsed, children, className }: SidebarGroupProps) {
  const classes = [styles.group, className].filter(Boolean).join(' ');
  return (
    <div className={classes} role="group" aria-label={label}>
      <div className={styles.label} aria-hidden={collapsed ? 'true' : undefined}>
        {collapsed ? null : label}
      </div>
      {children}
    </div>
  );
}
