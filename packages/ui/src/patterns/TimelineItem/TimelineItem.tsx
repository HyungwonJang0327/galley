import { useId, useState, type ReactNode } from 'react';
import styles from './TimelineItem.module.css';

/** 표현 어휘. 도메인 상태(승인 대기 등)는 앱이 이 넷 중 하나로 매핑한다. */
export type TimelineStatus = 'pending' | 'active' | 'done' | 'failed';

export interface TimelineItemProps {
  status: TimelineStatus;
  /** 마커의 접근성 이름(예: "완료"). 시각적으로는 숨기고 읽어주기만 한다. */
  statusLabel?: string;
  title: ReactNode;
  /** 제목 아래 보조 텍스트 한 줄. 무엇을 넣을지는 앱이 정한다. */
  meta?: ReactNode;
  /** 우측 슬롯(배지·보기 버튼 등). */
  trailing?: ReactNode;
  /** 펼침 내용. 주면 제목이 토글 버튼이 된다. 없으면 그냥 한 줄. */
  children?: ReactNode;
  /** 비제어 초기 펼침 상태. */
  defaultOpen?: boolean;
  /** 주면 제어 모드가 된다(앱이 상태를 가짐). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 마지막 줄은 아래로 잇는 세로선을 그리지 않는다. */
  isLast?: boolean;
  className?: string;
}

/**
 * 타임라인 한 줄. TimelineItems(<ol>) 안에 놓는다.
 * 펼침은 기본 비제어 — open을 주면 그때부터 앱이 제어한다.
 */
export function TimelineItem({
  status,
  statusLabel,
  title,
  meta,
  trailing,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  isLast,
  className,
}: TimelineItemProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const panelId = useId();
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolledOpen;
  const expandable = children !== undefined && children !== null && children !== false;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const classes = [styles.item, isLast ? styles.last : null, className].filter(Boolean).join(' ');
  const body = (
    <>
      <span className={styles.title}>{title}</span>
      {meta !== undefined ? <span className={styles.meta}>{meta}</span> : null}
    </>
  );

  return (
    <li className={classes} data-status={status}>
      <div className={styles.line}>
        <span className={styles.marker} data-status={status}>
          {statusLabel !== undefined ? <span className={styles.srOnly}>{statusLabel}</span> : null}
        </span>
        {expandable ? (
          <button
            type="button"
            className={styles.body}
            onClick={toggle}
            aria-expanded={isOpen}
            aria-controls={panelId}
          >
            {body}
          </button>
        ) : (
          <div className={styles.body}>{body}</div>
        )}
        {trailing !== undefined ? <div className={styles.trailing}>{trailing}</div> : null}
      </div>
      {expandable ? (
        <div className={styles.panel} id={panelId} hidden={!isOpen}>
          {children}
        </div>
      ) : null}
    </li>
  );
}
