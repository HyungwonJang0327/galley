import type { ComponentProps } from 'react';
import styles from './Badge.module.css';

type Variant = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface BadgeProps extends ComponentProps<'span'> {
  /** 색 계열만 안다(도메인 매핑은 앱). neutral·info·warning·success·danger */
  variant?: Variant;
  /** 진행 중 표시용 펄스 점(예: 실행 중) */
  pulse?: boolean;
}

export function Badge({ variant = 'neutral', pulse = false, className, ...props }: BadgeProps) {
  const classes = [styles.badge, styles[variant], pulse && styles.pulse, className]
    .filter(Boolean)
    .join(' ');
  return <span className={classes} {...props} />;
}
