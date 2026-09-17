'use client';
import { Field as BaseField } from '@base-ui/react/field';
import { mergeProps } from '@base-ui/react/merge-props';
import type { ComponentProps } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** 입력값이 규칙에 어긋남. 테두리를 danger 색으로. */
  invalid?: boolean;
}

/** 공백으로 구분한 id 목록 둘을 합친다(둘 다 없으면 undefined). */
function joinIds(...lists: (string | undefined)[]): string | undefined {
  return lists.filter(Boolean).join(' ') || undefined;
}

/**
 * 여러 줄 텍스트 입력. Base UI에는 textarea 컴포넌트가 없어 Field.Control에 native 요소를 넘긴다 —
 * 그래야 FormField 안에서 Input처럼 이름·설명·invalid가 컨텍스트로 연결된다(밖에서는 그냥 textarea).
 * 폭은 부모가 정하고(width 100%), 높이는 rows(기본 3)·세로 리사이즈만.
 */
export function Textarea({
  invalid,
  className,
  rows = 3,
  id,
  value,
  defaultValue,
  ref,
  'aria-describedby': describedBy,
  ...props
}: TextareaProps) {
  const classes = [styles.textarea, className].filter(Boolean).join(' ');
  return (
    // id·value·ref는 Control이 알아야 한다 — id는 라벨의 htmlFor, value는 filled 상태, ref는 검증·포커스와 묶인다.
    <BaseField.Control
      id={id}
      value={value}
      defaultValue={defaultValue}
      ref={ref}
      // 함수형 render: 요소를 그대로 넘기면 그 props가 마지막에 병합돼 Field가 넣은
      // aria-describedby·aria-invalid를 덮어쓴다(undefined 키도 이긴다). 여기서 직접 합친다.
      render={(fieldProps) => (
        <textarea
          {...mergeProps<'textarea'>(fieldProps, { className: classes, rows, ...props })}
          aria-describedby={joinIds(describedBy, fieldProps['aria-describedby'])}
          aria-invalid={invalid || fieldProps['aria-invalid'] || undefined}
        />
      )}
    />
  );
}
