'use client';
import { Form as BaseForm } from '@base-ui/react/form';
import type { ComponentProps } from 'react';
import styles from './Form.module.css';

/** 필드 name → 오류 문구(들). 서버·폼 액션이 돌려준 오류를 필드에 꽂는다. */
export type FormErrors = Record<string, string | string[]>;
/** 필드 name → 값. 제출 시 모아 준다(Switch·Checkbox는 boolean). */
export type FormValues = Record<string, unknown>;

export interface FormProps extends ComponentProps<'form'> {
  /**
   * 오류 있는 필드가 하나도 없는 제출에서만 불린다 — 네이티브 제약 위반, 아직 안 지워진 `errors`,
   * FormField에 준 `error` 모두 제출을 막고 그 필드로 포커스를 옮긴다.
   * 값은 컨트롤의 name으로 모은다(preventDefault는 알아서 한다).
   * native `onSubmit`도 그대로 쓸 수 있지만 검증 실패 때는 둘 다 불리지 않는다.
   */
  onFormSubmit?: (values: FormValues) => void;
  /**
   * 밖에서 온 오류(서버 응답 등). 키는 컨트롤의 name. FormField의 오류 자리에 뜨고, 그 필드 값을
   * 바꾸면 지워진다. FormField에 직접 준 `error`가 있으면 그것이 우선한다.
   */
  errors?: FormErrors;
}

/**
 * 폼(Base UI Form). 브라우저 말풍선 대신(noValidate) 제출 때 안쪽 FormField들을 검증해 오류를 필드
 * 아래에 띄우고, 첫 오류 필드로 포커스를 옮긴다. 검증 규칙은 컨트롤의 네이티브 제약(required 등)과
 * `errors`뿐 — 자체 규칙은 없다. 배치는 정하지 않는다(세로 간격만, className으로 바꾼다).
 */
export function Form({ className, onFormSubmit, errors, ...props }: FormProps) {
  const classes = [styles.form, className].filter(Boolean).join(' ');
  return (
    <BaseForm
      className={classes}
      errors={errors}
      onFormSubmit={onFormSubmit ? (values) => onFormSubmit(values) : undefined}
      {...props}
    />
  );
}
