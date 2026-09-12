import type { ReactNode } from 'react';
import styles from './SplitPane.module.css';

export interface SplitPaneProps {
  /** 좌 고정폭 영역(검색·탭·항목 목록). 내용이 길면 이 영역만 스크롤한다. */
  list: ReactNode;
  /** 우 본문. 좌우가 각각 따로 스크롤한다. */
  children: ReactNode;
  /** 우 상단 고정 영역. 본문을 스크롤해도 남는다. */
  header?: ReactNode;
  /** 우 하단 고정 영역(ActionBar 자리). 본문을 스크롤해도 남는다. */
  footer?: ReactNode;
  /** 좌 영역의 접근성 이름. 주면 region으로 노출해 스크린 리더가 두 영역을 구분한다. */
  listLabel?: string;
  /** 우 영역의 접근성 이름. */
  detailLabel?: string;
  className?: string;
}

/**
 * 2분할 상세형(B) 골격. 한 카드 안에서 좌(고정폭 목록) / 우(헤더·본문·하단 바)로 나눈다.
 * 높이는 부모가 준 만큼 채우고, 부모가 높이를 안 주면 토큰 최소 높이로 선다.
 */
export function SplitPane({
  list,
  children,
  header,
  footer,
  listLabel,
  detailLabel,
  className,
}: SplitPaneProps) {
  const classes = [styles.pane, className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <div
        className={styles.list}
        role={listLabel !== undefined ? 'region' : undefined}
        aria-label={listLabel}
      >
        {list}
      </div>
      <div
        className={styles.detail}
        role={detailLabel !== undefined ? 'region' : undefined}
        aria-label={detailLabel}
      >
        {header !== undefined ? <div className={styles.header}>{header}</div> : null}
        <div className={styles.body}>{children}</div>
        {footer !== undefined ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}
