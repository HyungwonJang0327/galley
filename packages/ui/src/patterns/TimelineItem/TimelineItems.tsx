import type { ComponentProps } from 'react';
import styles from './TimelineItem.module.css';

export type TimelineItemsProps = ComponentProps<'ol'>;

/** TimelineItem을 담는 순서 있는 목록. 단계 순서는 소비자가 정한다. */
export function TimelineItems({ className, children, ...props }: TimelineItemsProps) {
  const classes = [styles.items, className].filter(Boolean).join(' ');
  return (
    <ol className={classes} {...props}>
      {children}
    </ol>
  );
}
