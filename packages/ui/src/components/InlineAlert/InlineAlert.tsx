import type { ComponentProps, ReactNode } from 'react';
import { toneIcon } from '../../internal/tone';
import type { Tone } from '../../internal/tone';
import styles from './InlineAlert.module.css';

export type InlineAlertTone = Tone;
export type InlineAlertVariant = 'filled' | 'plain';

export interface InlineAlertProps extends Omit<ComponentProps<'div'>, 'title' | 'role'> {
  /**
   * 색·아이콘·알림 세기를 정한다(의미 매핑은 앱). 기본 info.
   * warning·danger는 마운트될 때마다 끼어들어 읽힌다 — 늘 떠 있는 정적 안내에는 info를 쓴다.
   */
  tone?: InlineAlertTone;
  /**
   * filled(기본)는 tone 배경이 있는 상자. plain은 배경·여백 없이 아이콘과 글자만 tone 색으로 —
   * 목록 행 안이나 이미 상자인 곳처럼 상자를 또 두기 어색한 자리에 쓴다.
   */
  variant?: InlineAlertVariant;
  /** 굵은 한 줄 제목. */
  title?: ReactNode;
  /** 본문 문구. */
  children: ReactNode;
  /** 오른쪽 끝 슬롯(다시 시도 버튼 등). */
  action?: ReactNode;
}

/**
 * 화면 안에 놓이는 알림 상자. 제목+본문이 live 영역이다 — tone이 danger·warning이면 role="alert"
 * (끼어들어 읽힘), info·success면 role="status"(하던 낭독 뒤에 읽힘). 아이콘은 장식이고 action은
 * live 영역 밖에 둔다.
 *
 * 낭독: alert tone(danger·warning)은 조건부로 렌더하면 나타나는 순간 읽힌다. status tone(info·success)은
 * 영역과 문구가 동시에 생기면 스크린리더가 놓치기 쉽다 — 낭독이 꼭 필요하면 앱이 처음부터 마운트해 둔
 * live 영역 안에 넣는다.
 */
export function InlineAlert({
  tone = 'info',
  variant = 'filled',
  title,
  children,
  action,
  className,
  ...props
}: InlineAlertProps) {
  const classes = [styles.alert, styles[tone], styles[variant], className]
    .filter(Boolean)
    .join(' ');
  const Icon = toneIcon(tone);
  const hasTitle = title !== undefined && title !== null && title !== false && title !== '';
  return (
    // 루트는 상자일 뿐이다. role은 타입에서 뺐고, 우회해 넘어와도 지운다.
    <div className={classes} {...props} role={undefined}>
      {/* 아이콘과 본문은 한 덩어리 — 좁은 자리에서 줄바꿈되는 것은 action뿐이어야 한다. */}
      <div className={styles.main}>
        <span className={styles.icon}>
          <Icon size={variant === 'plain' ? 14 : 16} aria-hidden="true" />
        </span>
        {/*
        live 영역은 제목+본문만 — action은 밖에 둔다. alert·status는 암묵적으로 aria-atomic이라
        안에 버튼이 있으면 라벨이 본문에 이어 읽히고, 버튼 내용이 바뀔 때 알림 전체가 다시 낭독된다.
      */}
        <div
          className={styles.body}
          role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
        >
          {hasTitle ? <div className={styles.title}>{title}</div> : null}
          <div className={styles.message}>{children}</div>
        </div>
      </div>
      {action !== undefined && action !== null && action !== false ? (
        <div className={styles.action}>{action}</div>
      ) : null}
    </div>
  );
}
