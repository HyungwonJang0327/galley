import { cloneElement, isValidElement } from 'react';
import type { ReactElement } from 'react';
import styles from './ListToolbar.module.css';

/** render로 넘길 링크/버튼 요소. className은 병합, 임의 속성 허용. */
type RenderElement = ReactElement<{ className?: string; [key: string]: unknown }>;

export interface ListToolbarTabProps {
  /** 탭 라벨. */
  label: string;
  /** 라벨 옆 개수. 0도 그대로 표시. */
  count?: number;
  /** 활성(현재 URL 쿼리). 블루 텍스트 + 밑줄. */
  isActive?: boolean;
  className?: string;
  /** 링크/버튼 요소(예: Next <Link href />). 미지정 시 <a>. */
  render?: RenderElement;
}

/** 툴바의 URL 링크 탭(?tab=). 페이지 내 상태 탭이 아니라 이동이다. */
export function ListToolbarTab({ label, count, isActive, className, render }: ListToolbarTabProps) {
  const content = (
    <>
      <span className={styles.tabLabel}>{label}</span>
      {count !== undefined ? <span className={styles.tabCount}>{count}</span> : null}
    </>
  );

  const rootClass = [
    styles.tab,
    isActive ? styles.tabActive : null,
    className,
    render && isValidElement(render) ? render.props.className : null,
  ]
    .filter(Boolean)
    .join(' ');

  const props = {
    className: rootClass,
    'aria-current': isActive ? ('page' as const) : undefined,
  };

  if (render && isValidElement(render)) {
    return cloneElement(render, props, content);
  }
  return <a {...props}>{content}</a>;
}
