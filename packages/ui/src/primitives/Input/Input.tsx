'use client';
import { Input as BaseInput } from '@base-ui/react/input';
import type { ComponentProps } from 'react';
import { useFieldRequired } from '../FormField/FormFieldContext';
import styles from './Input.module.css';

export interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
  /** 입력값이 규칙에 어긋남. 테두리를 danger 색으로. */
  invalid?: boolean;
}

/**
 * 한 줄 텍스트 입력(Base UI Input). 폭은 부모가 정한다(width 100%·min-width 0) — Select 트리거와
 * 같은 높이·테두리·포커스 링이라 ActionBar·툴바에서 나란히 놓인다.
 */
export function Input({ invalid, className, required, ...props }: InputProps) {
  // FormField 안에서는 필드의 required를 물려받는다(직접 주면 그 값이 우선).
  const isRequired = useFieldRequired(required);
  const classes = [styles.input, className].filter(Boolean).join(' ');
  return (
    <BaseInput
      className={classes}
      aria-invalid={invalid || undefined}
      required={isRequired}
      {...props}
    />
  );
}
