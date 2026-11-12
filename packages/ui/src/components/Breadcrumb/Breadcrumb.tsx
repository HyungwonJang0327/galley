import { cloneElement, isValidElement, type ReactElement } from 'react';
import { ChevronRight } from 'lucide-react';
import { mergeProps } from '@base-ui/react/merge-props';
import styles from './Breadcrumb.module.css';

/** render로 넘길 링크 요소(예: Next <Link href />). className은 병합, 임의 속성 허용. */
type RenderElement = ReactElement<{ className?: string; [key: string]: unknown }>;

export interface BreadcrumbItem {
  label: string;
  /**
   * 링크로 그릴 요소. 없으면 글자만(상위 묶음 이름처럼 페이지가 없는 단계). 마지막 항목은 현재 페이지라 render를 넘겨도
   * 링크로 그리지 않는다(`aria-current="page"` 글자).
   */
  render?: RenderElement;
}

export interface BreadcrumbProps {
  /** 앞(상위)에서 뒤(현재 페이지) 순. 마지막이 현재 페이지. */
  items: readonly BreadcrumbItem[];
  /** nav의 접근성 이름. 기본 'Breadcrumb' — 한국어 앱은 '현재 위치'를 넘긴다. */
  'aria-label'?: string;
  /** 루트 nav에 병합. */
  className?: string;
}

/**
 * 경로 표시(`상위 › 현재`). `<nav aria-label>` 안 `<ol>` — 구분 기호는 장식(aria-hidden)이고 마지막 항목만
 * `aria-current="page"`다. 링크 요소는 앱이 render로 넘긴다(Button과 같은 규칙) — ui는 라우터를 모른다.
 */
export function Breadcrumb({
  items,
  'aria-label': ariaLabel = 'Breadcrumb',
  className,
}: BreadcrumbProps) {
  const classes = [styles.nav, className].filter(Boolean).join(' ');
  const last = items.length - 1;
  return (
    <nav aria-label={ariaLabel} className={classes}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isCurrent = index === last;
          return (
            <li key={`${index}-${item.label}`} className={styles.item}>
              {index > 0 ? (
                <ChevronRight size={12} aria-hidden="true" className={styles.separator} />
              ) : null}
              {isCurrent ? (
                <span aria-current="page" className={styles.current}>
                  {item.label}
                </span>
              ) : item.render !== undefined && isValidElement(item.render) ? (
                cloneElement(
                  item.render,
                  mergeProps(item.render.props, { className: styles.link }),
                  item.label,
                )
              ) : (
                <span className={styles.text}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
