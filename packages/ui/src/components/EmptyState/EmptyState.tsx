import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** 한 줄 안내 문구. */
  message: string;
  /** 선택 액션 슬롯(Button 등). */
  action?: ReactNode;
  className?: string;
}

/** 목록·카드가 비었을 때의 안내(한 줄 + 선택 액션). 그림·일러스트 없음. */
export function EmptyState({ message, action, className }: EmptyStateProps) {
  const classes = [styles.empty, className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <p className={styles.message}>{message}</p>
      {action !== undefined ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
