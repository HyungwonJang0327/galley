import type { ComponentProps } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** 입력값이 규칙에 어긋남. 테두리를 danger 색으로. */
  invalid?: boolean;
}

/**
 * 여러 줄 텍스트 입력. Base UI에는 textarea가 없어 native 요소를 Input과 같은 토큰으로 감싼다.
 * 폭은 부모가 정하고(width 100%), 높이는 rows(기본 3)·세로 리사이즈만.
 */
export function Textarea({ invalid, className, rows = 3, ...props }: TextareaProps) {
  const classes = [styles.textarea, className].filter(Boolean).join(' ');
  return (
    <textarea className={classes} rows={rows} aria-invalid={invalid || undefined} {...props} />
  );
}
