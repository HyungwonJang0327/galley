import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  /** 우측 액션(버튼 등) */
  actions?: ReactNode;
  /** 루트 header에 병합. */
  className?: string;
}

export function PageHeader({ title, actions, className }: PageHeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(' ');
  return (
    <header className={classes}>
      <h1 className={styles.title}>{title}</h1>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
