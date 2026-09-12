import type { ReactNode } from 'react';
import styles from './ActionBar.module.css';

export interface ActionBarProps {
  /** 좌측 컨트롤(Select·입력 등). 넓은 자리를 차지한다. */
  children: ReactNode;
  /** 우측 버튼들. */
  actions?: ReactNode;
  /** 영역의 접근성 이름. */
  label?: string;
  className?: string;
}

/**
 * 화면 하단 고정 바. SplitPane의 footer 자리에 넣으면 grid가 고정하고,
 * 그냥 스크롤 영역 안에 넣어도 sticky로 바닥에 붙는다.
 */
export function ActionBar({ children, actions, label, className }: ActionBarProps) {
  const classes = [styles.bar, className].filter(Boolean).join(' ');
  return (
    <div className={classes} role="group" aria-label={label}>
      <div className={styles.controls}>{children}</div>
      {actions !== undefined ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
