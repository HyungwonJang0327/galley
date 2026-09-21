import type { ComponentProps } from 'react';
import styles from './Separator.module.css';

export type SeparatorOrientation = 'horizontal' | 'vertical';

// role·aria-orientation은 orientation·decorative로만 정한다(소비자가 어긋난 조합을 못 만들게).
export interface SeparatorProps extends Omit<
  ComponentProps<'div'>,
  'children' | 'role' | 'aria-orientation'
> {
  /**
   * 선의 방향. vertical은 flex·grid 행의 직계 자식일 때 부모 높이를 채운다.
   * 그 밖에서는 글자 높이(1em)만큼만 그려지니 className으로 높이를 준다
   */
  orientation?: SeparatorOrientation;
  /** true면 시각 장식(role="none") — 보조 기술이 읽지 않는다. false면 role="separator" */
  decorative?: boolean;
}

export function Separator({
  orientation = 'horizontal',
  decorative = false,
  className,
  ...props
}: SeparatorProps) {
  const classes = [styles.separator, styles[orientation], className].filter(Boolean).join(' ');
  // role·aria-orientation은 스프레드 뒤에 둔다 — 타입을 우회해 넘어온 값도 덮어쓴다.
  // separator의 aria-orientation 기본값은 horizontal이라 vertical일 때만 적는다.
  return (
    <div
      className={classes}
      {...props}
      role={decorative ? 'none' : 'separator'}
      aria-orientation={!decorative && orientation === 'vertical' ? 'vertical' : undefined}
    />
  );
}
