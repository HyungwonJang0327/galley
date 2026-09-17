import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import styles from './InlineAlert.module.css';

export type InlineAlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface InlineAlertProps extends Omit<ComponentProps<'div'>, 'title' | 'role'> {
  /** 색·아이콘·알림 세기를 정한다(의미 매핑은 앱). 기본 info. */
  tone?: InlineAlertTone;
  /** 굵은 한 줄 제목. */
  title?: ReactNode;
  /** 본문 문구. */
  children: ReactNode;
  /** 오른쪽 끝 슬롯(다시 시도 버튼 등). */
  action?: ReactNode;
}

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

/**
 * 화면 안에 놓이는 알림 상자. tone이 danger·warning이면 role="alert"(나타나는 즉시 끼어들어 읽힘),
 * info·success면 role="status"(하던 낭독이 끝난 뒤 읽힘). 아이콘은 장식 — 뜻은 문구가 전한다.
 * 조건부로 렌더하면 나타날 때 스크린리더가 읽는다.
 */
export function InlineAlert({
  tone = 'info',
  title,
  children,
  action,
  className,
  ...props
}: InlineAlertProps) {
  const classes = [styles.alert, styles[tone], className].filter(Boolean).join(' ');
  const Icon = ICONS[tone];
  const hasTitle = title !== undefined && title !== null && title !== false && title !== '';
  return (
    // role은 스프레드 뒤에 둔다 — 타입을 우회해 넘어온 값도 tone이 정한 role이 덮는다.
    <div
      className={classes}
      {...props}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
      <span className={styles.icon}>
        <Icon size={16} aria-hidden="true" />
      </span>
      <div className={styles.body}>
        {hasTitle ? <div className={styles.title}>{title}</div> : null}
        <div className={styles.message}>{children}</div>
      </div>
      {action !== undefined && action !== null && action !== false ? (
        <div className={styles.action}>{action}</div>
      ) : null}
    </div>
  );
}
