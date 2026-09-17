'use client';
import { Field as BaseField } from '@base-ui/react/field';
import type { ComponentProps } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** 입력값이 규칙에 어긋남. 테두리를 danger 색으로. */
  invalid?: boolean;
}

/**
 * 여러 줄 텍스트 입력. Base UI에는 textarea 컴포넌트가 없어 Field.Control에 native 요소를 넘긴다 —
 * 그래야 FormField 안에서 Input처럼 이름·설명·invalid가 컨텍스트로 연결된다(밖에서는 그냥 textarea).
 * 폭은 부모가 정하고(width 100%), 높이는 rows(기본 3)·세로 리사이즈만.
 */
export function Textarea({ invalid, className, rows = 3, ...props }: TextareaProps) {
  const classes = [styles.textarea, className].filter(Boolean).join(' ');
  return (
    <BaseField.Control
      // aria-invalid는 invalid일 때만 적는다 — undefined라도 키가 있으면 Field가 넣은 값을 덮어쓴다.
      render={
        <textarea
          className={classes}
          rows={rows}
          {...(invalid ? { 'aria-invalid': true } : null)}
          {...props}
        />
      }
    />
  );
}
