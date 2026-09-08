import type { ComponentProps } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

export interface ButtonProps extends ComponentProps<'button'> {
  /** primary=포인트 블루(주요 액션) · secondary=외곽선 · ghost=배경 없음 */
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...props} />;
}
