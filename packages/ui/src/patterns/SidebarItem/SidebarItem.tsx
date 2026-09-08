import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import styles from './SidebarItem.module.css';

/** render로 넘길 링크/버튼 요소. className은 병합, 임의 속성 허용. */
type RenderElement = ReactElement<{ className?: string; [key: string]: unknown }>;

export interface SidebarItemProps {
  /** 좌측 아이콘(lucide 등). */
  icon?: ReactNode;
  /** 항목 라벨. */
  label: string;
  /** 우측 배지(대기 n·실행 중 등). */
  badge?: ReactNode;
  /** 활성(현재 URL). 텍스트·아이콘 블루 + 연한 틴트 배경. */
  isActive?: boolean;
  /** 접힘: 아이콘만, 라벨은 title로. */
  collapsed?: boolean;
  className?: string;
  /** 링크/버튼 요소(예: Next <Link href />). 미지정 시 <a>. */
  render?: RenderElement;
}

export function SidebarItem({
  icon,
  label,
  badge,
  isActive,
  collapsed,
  className,
  render,
}: SidebarItemProps) {
  const content = (
    <>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {collapsed ? null : <span className={styles.label}>{label}</span>}
      {collapsed || !badge ? null : <span className={styles.badge}>{badge}</span>}
    </>
  );

  const rootClass = [
    styles.item,
    isActive ? styles.active : null,
    collapsed ? styles.collapsed : null,
    className,
    render && isValidElement(render) ? render.props.className : null,
  ]
    .filter(Boolean)
    .join(' ');

  const props = {
    className: rootClass,
    title: collapsed ? label : undefined,
    'aria-current': isActive ? ('page' as const) : undefined,
  };

  if (render && isValidElement(render)) {
    return cloneElement(render, props, content);
  }
  return <a {...props}>{content}</a>;
}
