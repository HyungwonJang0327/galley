import type { ComponentProps, ReactNode } from 'react';
import styles from './TopBarChip.module.css';

export interface TopBarChipProps extends Omit<ComponentProps<'button'>, 'type'> {
  /** 활성(워크스페이스 탭 등) — 블루 배경. */
  isActive?: boolean;
  /** 우측 요소(▾ 등). */
  trailing?: ReactNode;
}

export function TopBarChip({ isActive, trailing, className, children, ...props }: TopBarChipProps) {
  const classes = [styles.chip, isActive ? styles.active : null, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={classes} {...props}>
      {children}
      {trailing ? <span className={styles.trailing}>{trailing}</span> : null}
    </button>
  );
}
