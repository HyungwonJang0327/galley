import type { ReactNode } from 'react';
import styles from './ItemContent.module.css';

export interface ItemContentProps {
  /** 라벨. 두 줄까지(line-clamp 2), 넘치면 ellipsis. ReactNode라 Select.ItemText 등으로 감쌀 수 있다. */
  label: ReactNode;
  /** 라벨 아래 한 줄 회색 보조 텍스트. 넘치면 ellipsis. */
  description?: ReactNode;
  /** 우측 메타(단가·단축키 등). 줄어들지 않고 tabular-nums. */
  meta?: ReactNode;
  className?: string;
}

/** 목록 항목 공통 레이아웃: [본문 열: 라벨 / 보조] + [우측 메타]. Select·Menu 아이템이 공유한다. */
export function ItemContent({ label, description, meta, className }: ItemContentProps) {
  const classes = [styles.content, className].filter(Boolean).join(' ');
  return (
    <span className={classes}>
      <span className={styles.body}>
        <span className={styles.label}>{label}</span>
        {description !== undefined ? (
          <span className={styles.description}>{description}</span>
        ) : null}
      </span>
      {meta !== undefined ? <span className={styles.meta}>{meta}</span> : null}
    </span>
  );
}
