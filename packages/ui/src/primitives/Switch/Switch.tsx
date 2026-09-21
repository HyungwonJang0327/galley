'use client';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import type { ReactNode } from 'react';
import { useFieldRequired } from '../FormField/FormFieldContext';
import { useAccessibleNameWarning } from '../../internal/accessibleName';
import styles from './Switch.module.css';

export interface SwitchProps {
  /** 제어형만. */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 라벨. 클릭하면 토글된다. 없으면 aria-label을 준다(둘 다 없으면 FormField 안이어야 한다 — 개발 모드 경고). */
  children?: ReactNode;
  'aria-label'?: string;
  disabled?: boolean;
  /** 폼 제출용 이름. */
  name?: string;
  /** 필수. FormField 안에서는 필드의 required를 물려받는다(직접 주면 그 값이 우선). */
  required?: boolean;
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
  required,
  className,
}: SwitchProps) {
  const isRequired = useFieldRequired(required);
  useAccessibleNameWarning(
    'Switch',
    (children !== undefined && children !== null) || ariaLabel !== undefined,
  );
  const classes = [styles.label, className].filter(Boolean).join(' ');
  return (
    <label className={classes} data-disabled={disabled || undefined}>
      <BaseSwitch.Root
        className={styles.track}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        disabled={disabled}
        name={name}
        required={isRequired}
        aria-label={ariaLabel}
      >
        <BaseSwitch.Thumb className={styles.thumb} />
      </BaseSwitch.Root>
      {children !== undefined ? <span className={styles.text}>{children}</span> : null}
    </label>
  );
}
