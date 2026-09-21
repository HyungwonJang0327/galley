import { cloneElement, isValidElement } from 'react';
import type { ComponentProps, ReactElement } from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

/** render로 넘길 링크 요소. className은 병합, 임의 속성 허용. */
type RenderElement = ReactElement<{ className?: string; [key: string]: unknown }>;

export interface ButtonProps extends ComponentProps<'button'> {
  /** primary=포인트 블루(주요 액션) · secondary=외곽선 · ghost=배경 없음 · danger=빨강 채움(되돌릴 수 없는 액션의 확인) */
  variant?: Variant;
  size?: Size;
  /**
   * 버튼 모양이지만 링크여야 할 때 그 요소(예: Next <Link href />). 넘기면 button 대신 이 요소로
   * 렌더하고 나머지 props(onClick·aria-*·data-* 등)는 그 요소의 props와 병합한다 — 이벤트 핸들러는
   * 둘 다 불리고 className은 합쳐진다. `type`·`disabled` 같은 button 전용 속성은 넘기지 않는다.
   */
  render?: RenderElement;
}

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  render,
  children,
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], styles[size], className]
    .filter(Boolean)
    .join(' ');

  if (render !== undefined && isValidElement(render)) {
    // disabled는 <a>에 의미가 없다(타입은 button props라 들어올 수 있음) — 버린다.
    const { disabled: _disabled, ...rest } = props;
    void _disabled;
    return cloneElement(render, mergeProps(rest, render.props, { className: classes }), children);
  }
  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
