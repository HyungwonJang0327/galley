import type { ComponentProps } from 'react';
import styles from './Badge.module.css';

/** 색 계열. neutral·info·warning·success·danger */
export type BadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface BadgeProps extends ComponentProps<'span'> {
  /** 색 계열만 안다(도메인 매핑은 앱). tone=색, variant=모양·역할(다른 컴포넌트와 같은 규칙). */
  tone?: BadgeTone;
  /** 진행 중 표시용 펄스 점 */
  pulse?: boolean;
}

export function Badge({ tone = 'neutral', pulse = false, className, ...props }: BadgeProps) {
  const classes = [styles.badge, styles[tone], pulse && styles.pulse, className]
    .filter(Boolean)
    .join(' ');
  return <span className={classes} {...props} />;
}
