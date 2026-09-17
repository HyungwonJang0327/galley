'use client';
import { Field as BaseField } from '@base-ui/react/field';
import type { ReactNode } from 'react';
import styles from './FormField.module.css';

export interface FormFieldProps {
  /** 컨트롤의 접근성 이름이 되는 라벨. */
  label: ReactNode;
  /** 라벨 아래 회색 보조 설명. 컨트롤의 aria-describedby에 연결된다. */
  description?: ReactNode;
  /** 오류 문구. 비어 있지 않으면 필드가 invalid가 되고 문구가 aria-describedby에 연결된다. */
  error?: string;
  /** 라벨 옆 필수 표시(*)만 그린다. 컨트롤의 required는 소비자가 컨트롤에 직접 준다. */
  required?: boolean;
  /**
   * 컨트롤 하나(Input·Textarea·Select·Switch·Checkbox·RadioGroup).
   * Switch·Checkbox는 children(안쪽 라벨) 없이 넣는다 — 이름은 필드 라벨이 주고, 안쪽 글자는
   * 화면에는 보여도 접근성 이름에서 빠진다(aria-labelledby가 우선).
   */
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
  // 빈 문자열은 오류 없음 — `error={cond && '…'}`·`errors.x ?? ''` 같은 패턴에서 문구 없는 빨간 테두리가 나오지 않게.
  const hasError = Boolean(error);
  return (
    <BaseField.Root className={classes} invalid={hasError}>
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
      {/*
        오류 문구는 항상 마운트된 live 영역 안에 그린다 — 문구와 동시에 생기는 live 영역은
        스크린리더가 놓치고, aria-describedby 연결만으로는 포커스를 다시 옮기기 전까지 읽히지 않는다.
      */}
      <div className={styles.errorRegion} aria-live="polite">
        {hasError ? (
          <BaseField.Error className={styles.error} match>
            {error}
          </BaseField.Error>
        ) : null}
      </div>
    </BaseField.Root>
  );
}
