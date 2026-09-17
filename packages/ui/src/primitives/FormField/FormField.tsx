'use client';
import { Field as BaseField } from '@base-ui/react/field';
import type { ReactNode } from 'react';
import styles from './FormField.module.css';

export interface FormFieldProps {
  /** 컨트롤의 접근성 이름이 되는 라벨. */
  label: ReactNode;
  /** 라벨 아래 회색 보조 설명. 컨트롤의 aria-describedby에 연결된다. */
  description?: ReactNode;
  /** 오류 문구. 있으면 필드가 invalid가 되고 문구가 aria-describedby에 연결된다. */
  error?: string;
  /** 라벨 옆 필수 표시(*)만 그린다. 컨트롤의 required는 소비자가 컨트롤에 직접 준다. */
  required?: boolean;
  /** 컨트롤 하나(Input·Textarea·Select·Switch·Checkbox·RadioGroup). */
  children: ReactNode;
  /** 필드 루트에 병합. */
  className?: string;
}

/**
 * 폼 필드(Base UI Field). 라벨 · 컨트롤 · 설명 · 오류를 세로로 쌓고, 컨트롤에 이름·설명·invalid를
 * 컨텍스트로 연결한다. 검증은 하지 않는다 — 오류 문구는 앱이 정해 `error`로 넘긴다.
 */
export function FormField({
  label,
  description,
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const classes = [styles.field, className].filter(Boolean).join(' ');
  return (
    <BaseField.Root className={classes} invalid={error !== undefined}>
      <BaseField.Label className={styles.label}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </BaseField.Label>
      {children}
      {description !== undefined ? (
        <BaseField.Description className={styles.description}>{description}</BaseField.Description>
      ) : null}
      {error !== undefined ? (
        <BaseField.Error className={styles.error} match>
          {error}
        </BaseField.Error>
      ) : null}
    </BaseField.Root>
  );
}
