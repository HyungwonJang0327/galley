import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  /** 제목 위 한 줄(경로 표시 Breadcrumb 등). 없으면 제목만. */
  eyebrow?: ReactNode;
  /** 우측 액션(버튼 등) */
  actions?: ReactNode;
  /** 루트 header에 병합. */
  className?: string;
}

export function PageHeader({ title, eyebrow, actions, className }: PageHeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(' ');
  return (
    <header className={classes}>
      <div className={styles.lead}>
        {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
