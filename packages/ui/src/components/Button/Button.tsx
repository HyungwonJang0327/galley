import { cloneElement, isValidElement } from 'react';
import type { ComponentProps, ReactElement } from 'react';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

/** render로 넘길 링크 요소. className은 병합, 임의 속성 허용. */
type RenderElement = ReactElement<{ className?: string; [key: string]: unknown }>;

export interface ButtonProps extends ComponentProps<'button'> {
  /** primary=포인트 블루(주요 액션) · secondary=외곽선 · ghost=배경 없음 */
  variant?: Variant;
  size?: Size;
  /**
   * 버튼 모양이지만 링크여야 할 때 그 요소(예: Next <Link href />). 넘기면 button 대신 이 요소로
   * 렌더하고 className만 병합한다(button 전용 속성은 쓰지 않는다).
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
    const merged = [classes, render.props.className].filter(Boolean).join(' ');
    return cloneElement(render, { className: merged }, children);
  }
  return (
    <button type={type} className={classes} {...props}>
      {children}
    </button>
  );
}
