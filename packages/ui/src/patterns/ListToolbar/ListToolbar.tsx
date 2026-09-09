import type { ComponentProps, ReactNode } from 'react';
import styles from './ListToolbar.module.css';

export interface ListToolbarProps extends ComponentProps<'div'> {
  /** 좌측 탭 그룹 슬롯(ListToolbarTab 나열). */
  tabs?: ReactNode;
  /** 우측 검색 슬롯(input 등). */
  search?: ReactNode;
  /** 우측 필터 슬롯(Select·체크박스 등). 검색 다음에 놓인다. */
  filters?: ReactNode;
}

/** 목록형(A) 카드 상단 툴바. 표현 전용 — 탭·검색·필터는 슬롯으로 받는다. */
export function ListToolbar({ tabs, search, filters, className, ...props }: ListToolbarProps) {
  const classes = [styles.toolbar, className].filter(Boolean).join(' ');
  const hasEnd = search !== undefined || filters !== undefined;
  return (
    <div role="toolbar" className={classes} {...props}>
      {tabs !== undefined ? <div className={styles.tabs}>{tabs}</div> : null}
      {hasEnd ? (
        <div className={styles.end}>
          {search}
          {filters}
        </div>
      ) : null}
    </div>
  );
}
