import type { ComponentProps, ReactNode } from 'react';
import styles from './ListRow.module.css';

export interface ListRowProps extends Omit<ComponentProps<'li'>, 'title'> {
  /** 좌측 슬롯(DnD 핸들·체크박스·진행 인디케이터). */
  leading?: ReactNode;
  /** 제목. 클릭 링크가 필요하면 앱이 여기서 Link로 감싼다(행 전체는 링크가 아니다). */
  title: ReactNode;
  /** 제목 아래 보조 텍스트 한 줄(회색). */
  meta?: ReactNode;
  /** 우측 슬롯(배지·시간). */
  trailing?: ReactNode;
  /** 맨 우측 액션 슬롯(⋮ 메뉴 등). */
  actions?: ReactNode;
  /** 선택·강조 행. 연한 틴트 배경. */
  isActive?: boolean;
}

/** 목록형(A) 한 줄. ListRows(<ul>) 안에 놓는다. */
export function ListRow({
  leading,
  title,
  meta,
  trailing,
  actions,
  isActive,
  className,
  ...props
}: ListRowProps) {
  const classes = [styles.row, isActive ? styles.active : null, className]
    .filter(Boolean)
    .join(' ');
  return (
    <li className={classes} aria-current={isActive ? 'true' : undefined} {...props}>
      {leading !== undefined ? <div className={styles.leading}>{leading}</div> : null}
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {meta !== undefined ? <div className={styles.meta}>{meta}</div> : null}
      </div>
      {trailing !== undefined ? <div className={styles.trailing}>{trailing}</div> : null}
      {actions !== undefined ? <div className={styles.actions}>{actions}</div> : null}
    </li>
  );
}
