import type { ComponentProps } from 'react';
import styles from './Separator.module.css';

type Orientation = 'horizontal' | 'vertical';

export interface SeparatorProps extends Omit<ComponentProps<'div'>, 'children' | 'role'> {
  /** 선의 방향. vertical은 부모(flex 행)의 높이를 채운다 */
  orientation?: Orientation;
  /** true면 시각 장식(role="none") — 보조 기술이 읽지 않는다. false면 role="separator" */
  decorative?: boolean;
}

export function Separator({
  orientation = 'horizontal',
  decorative = false,
  className,
  ...props
}: SeparatorProps) {
  const classes = [styles.separator, styles[orientation], className].filter(Boolean).join(' ');
  // separator의 aria-orientation 기본값은 horizontal이라 vertical일 때만 적는다.
  const a11y = decorative
    ? ({ role: 'none' } as const)
    : ({
        role: 'separator',
        'aria-orientation': orientation === 'vertical' ? 'vertical' : undefined,
      } as const);
  return <div className={classes} {...props} {...a11y} />;
}
