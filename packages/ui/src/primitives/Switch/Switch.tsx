'use client';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import type { ReactNode } from 'react';
import styles from './Switch.module.css';

export interface SwitchProps {
  /** 제어형만. */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 라벨. 클릭하면 토글된다. 없으면 aria-label을 준다. */
  children?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  /** 폼 제출용 이름. */
  name?: string;
  /** 라벨 요소에 병합. */
  className?: string;
}

/**
 * 스위치(Base UI). 역할 switch인 트랙 + 손잡이를 <label>로 감싸 라벨 클릭도 토글한다.
 * 키보드(Space·Enter)·폼 hidden input은 Base UI 기본값.
 */
export function Switch({
  checked,
  onCheckedChange,
  children,
  'aria-label': ariaLabel,
  disabled,
  name,
  className,
}: SwitchProps) {
  const classes = [styles.label, className].filter(Boolean).join(' ');
  return (
    <label className={classes} data-disabled={disabled || undefined}>
      <BaseSwitch.Root
        className={styles.track}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        name={name}
        aria-label={ariaLabel}
      >
        <BaseSwitch.Thumb className={styles.thumb} />
      </BaseSwitch.Root>
      {children !== undefined ? <span className={styles.text}>{children}</span> : null}
    </label>
  );
}
