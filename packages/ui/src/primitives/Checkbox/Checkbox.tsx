'use client';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
  /** 제어형만. */
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** 라벨. 클릭하면 토글된다. 없으면 aria-label을 준다. */
  children?: ReactNode;
  'aria-label'?: string;
  /** 일부만 선택된 상태(표시만 — checked 값은 그대로). */
  indeterminate?: boolean;
  disabled?: boolean;
  /** 폼 제출용 이름·값. */
  name?: string;
  value?: string;
  /** 라벨 요소에 병합. */
  className?: string;
}

/**
 * 체크박스(Base UI). 역할 checkbox인 버튼 + 시각 인디케이터를 <label>로 감싸 라벨 클릭도 토글한다.
 * 키보드(Space)·폼 hidden input은 Base UI 기본값.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  children,
  'aria-label': ariaLabel,
  indeterminate,
  disabled,
  name,
  value,
  className,
}: CheckboxProps) {
  const classes = [styles.label, className].filter(Boolean).join(' ');
  return (
    <label className={classes} data-disabled={disabled || undefined}>
      <BaseCheckbox.Root
        className={styles.box}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next)}
        indeterminate={indeterminate}
        disabled={disabled}
        name={name}
        value={value}
        aria-label={ariaLabel}
      >
        <BaseCheckbox.Indicator className={styles.indicator}>
          {indeterminate ? (
            <Minus size={12} strokeWidth={3} aria-hidden="true" />
          ) : (
            <Check size={12} strokeWidth={3} aria-hidden="true" />
          )}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {children !== undefined ? <span className={styles.text}>{children}</span> : null}
    </label>
  );
}
