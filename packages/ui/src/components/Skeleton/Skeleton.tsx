import type { ComponentProps, CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export type SkeletonRadius = 'sm' | 'md' | 'full';

/** 길이 값. 숫자는 px, 문자열은 CSS 값 그대로(`'60%'`, `'var(--ui-space-6)'`). */
export type SkeletonSize = number | string;

// 자리표시자라 children이 없다. role은 뜻이 없고 aria-hidden으로만 다룬다.
// 루트는 span(display:block) — 텍스트 자리(<p> 안 등)에 놓아도 유효한 중첩이다.
export interface SkeletonProps extends Omit<ComponentProps<'span'>, 'children' | 'role'> {
  /** 폭. 기본은 부모 폭(100%). */
  width?: SkeletonSize;
  /** 높이. 기본은 글자 높이(1em) — 텍스트 자리에 넣으면 폰트 크기를 따라간다. */
  height?: SkeletonSize;
  /** 모서리. sm(기본)·md는 토큰 라운드, full은 원·pill(아바타·배지 자리). */
  radius?: SkeletonRadius;
  /**
   * 텍스트 여러 줄 자리. 2 이상이면 줄 수만큼 막대를 쌓고 마지막 줄은 짧게 그린다.
   * width·height는 각 줄에 적용된다(높이 기본 1em).
   */
  lines?: number;
}

const toLength = (value: SkeletonSize | undefined): string | undefined =>
  typeof value === 'number' ? `${value}px` : value;

/**
 * 불러오는 동안 내용 자리를 잡아 두는 회색 막대. 보조 기술에는 숨긴다(`aria-hidden` 기본 true) —
 * "불러오는 중"은 자리표시자가 아니라 **그 내용을 담는 부모가** `aria-busy="true"`로 알린다.
 * 내용이 오면 부모의 aria-busy를 내리고 Skeleton을 내용으로 바꾼다.
 *
 * 움직임(펄스)은 `prefers-reduced-motion: reduce`에서 꺼진다.
 */
export function Skeleton({
  width,
  height,
  radius = 'sm',
  lines,
  className,
  style,
  ...props
}: SkeletonProps) {
  const size: CSSProperties = {};
  const w = toLength(width);
  const h = toLength(height);
  // 폭을 준 막대(아바타 등)는 flex 행에서 눌리지 않게 고정한다. 폭이 없으면 형제와 폭을 나눈다.
  if (w !== undefined) {
    size.width = w;
    size.flexShrink = 0;
  }
  if (h !== undefined) size.height = h;

  const barClass = [styles.bar, styles[radius]].filter(Boolean).join(' ');
  // 스프레드 뒤에서 기본을 보장한다 — 소비자가 aria-hidden={false}로 풀 수는 있지만,
  // undefined를 명시로 넘겨도(조건부 값) 기본 숨김이 지워지지 않는다.
  const hidden = props['aria-hidden'] ?? true;

  if (lines !== undefined && lines >= 2) {
    const count = Math.floor(lines);
    const classes = [styles.lines, className].filter(Boolean).join(' ');
    // 마지막 줄만 짧게 — 문단 끝처럼 보이게. width를 준 경우에도 그 폭의 60%(calc라 %·var()도 된다).
    const lastSize: CSSProperties = w === undefined ? size : { ...size, width: `calc(${w} * 0.6)` };
    return (
      <span className={classes} style={style} {...props} aria-hidden={hidden}>
        {Array.from({ length: count }, (_, i) => {
          const last = i === count - 1;
          return (
            <span
              key={i}
              className={[barClass, last ? styles.last : undefined].filter(Boolean).join(' ')}
              style={last ? lastSize : size}
            />
          );
        })}
      </span>
    );
  }

  const classes = [barClass, className].filter(Boolean).join(' ');
  return <span className={classes} style={{ ...style, ...size }} {...props} aria-hidden={hidden} />;
}
