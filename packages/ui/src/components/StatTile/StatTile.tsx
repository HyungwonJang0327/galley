import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import styles from './StatTile.module.css';

/** render로 넘길 링크 요소. className은 병합, 임의 속성 허용. */
type RenderElement = ReactElement<{ className?: string; [key: string]: unknown }>;

export interface StatTileProps {
  /** 위쪽 작은 회색 라벨. */
  label: string;
  /** 큰 숫자(또는 "—"). */
  value: ReactNode;
  /** 라벨 앞 아이콘 슬롯(lucide 등). */
  icon?: ReactNode;
  /**
   * 값 색. default=본문색 · muted=회색(값이 0일 때) · warning=주황(주의가 필요한 값).
   * 어떤 값이 어떤 톤인지는 앱이 정한다(ui는 도메인을 모른다).
   */
  tone?: 'default' | 'muted' | 'warning';
  /** 링크 주소. 라우터 링크가 필요하면 render를 쓴다. */
  href?: string;
  /** 링크 요소(예: Next <Link href />). href보다 우선. */
  render?: RenderElement;
  className?: string;
}

/** 홈 요약 타일(layout.md §4 요약형): 라벨 + 큰 값 + (링크면) 우하단 화살표. 배경색 블록 없음. */
export function StatTile({
  label,
  value,
  icon,
  tone = 'default',
  href,
  render,
  className,
}: StatTileProps) {
  const hasRender = render !== undefined && isValidElement(render);
  const isLink = hasRender || href !== undefined;

  const content = (
    <>
      <span className={styles.head}>
        {icon !== undefined ? (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className={styles.label}>{label}</span>
      </span>
      <span className={styles.value}>{value}</span>
      {isLink ? <ArrowUpRight className={styles.arrow} size={16} aria-hidden="true" /> : null}
    </>
  );

  const rootClass = [
    styles.tile,
    styles[tone],
    isLink ? styles.link : null,
    className,
    hasRender ? render.props.className : null,
  ]
    .filter(Boolean)
    .join(' ');

  if (hasRender) return cloneElement(render, { className: rootClass }, content);
  if (href !== undefined)
    return (
      <a className={rootClass} href={href}>
        {content}
      </a>
    );
  return <div className={rootClass}>{content}</div>;
}
