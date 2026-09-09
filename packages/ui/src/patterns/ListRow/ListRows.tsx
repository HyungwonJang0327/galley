import type { ComponentProps } from 'react';
import styles from './ListRow.module.css';

export type ListRowsProps = ComponentProps<'ul'>;

/** ListRow 목록 컨테이너(<ul>). 리스트 리셋 + 행 사이 구분선. */
export function ListRows({ className, ...props }: ListRowsProps) {
  const classes = [styles.rows, className].filter(Boolean).join(' ');
  return <ul className={classes} {...props} />;
}
