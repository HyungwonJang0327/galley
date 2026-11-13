import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import styles from './Pagination.module.css';

export type PaginationItem = number | 'ellipsis';

export interface PaginationRangeOptions {
  /** 현재 페이지 양옆에 보이는 수. 기본 1. */
  siblingCount?: number;
  /** 처음·끝에 항상 보이는 수. 기본 1. */
  boundaryCount?: number;
}

/** 접근성 이름·보조 글자. 기본은 영어 — 한국어 앱은 넘긴다. */
export interface PaginationLabels {
  previous: string;
  next: string;
  first: string;
  last: string;
  /** n페이지 버튼의 접근성 이름(보이는 글자는 숫자). */
  page: (page: number) => string;
}

export interface PaginationProps {
  /** 현재 페이지(1부터). 범위를 벗어나면 안쪽으로 맞춘다. 제어형만. */
  page: number;
  /** 전체 페이지 수. 1 미만이면 아무것도 그리지 않는다. */
  pageCount: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  boundaryCount?: number;
  /** 처음·끝으로 가는 버튼. 기본 없음. */
  showFirstLast?: boolean;
  disabled?: boolean;
  /** nav의 접근성 이름. 기본 'Pagination' — 한국어 앱은 '페이지 이동'을 넘긴다. */
  'aria-label'?: string;
  labels?: Partial<PaginationLabels>;
  /** 루트 nav에 병합. */
  className?: string;
}

const DEFAULT_LABELS: PaginationLabels = {
  previous: 'Previous page',
  next: 'Next page',
  first: 'First page',
  last: 'Last page',
  page: (page) => `Page ${page}`,
};

const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i);

/**
 * 보여 줄 항목(순수): 처음 `boundaryCount`개 · 현재 ± `siblingCount` · 끝 `boundaryCount`개, 사이가 2 이상 비면 `'ellipsis'`,
 * 딱 1이 비면 그 페이지를 그대로(생략 기호가 숫자 하나보다 길다). 전부 들어가면 생략 없음. 결정적이고 양끝에서 폭이 같다.
 */
export function paginationRange(
  page: number,
  pageCount: number,
  { siblingCount = 1, boundaryCount = 1 }: PaginationRangeOptions = {},
): PaginationItem[] {
  if (pageCount < 1) return [];
  const current = Math.min(Math.max(page, 1), pageCount);
  const total = boundaryCount * 2 + siblingCount * 2 + 3;
  if (pageCount <= total) return range(1, pageCount);

  const startPages = range(1, boundaryCount);
  const endPages = range(pageCount - boundaryCount + 1, pageCount);
  const siblingsStart = Math.max(
    Math.min(current - siblingCount, pageCount - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(current + siblingCount, boundaryCount + siblingCount * 2 + 2),
    pageCount - boundaryCount - 1,
  );
  const items: PaginationItem[] = [...startPages];
  if (siblingsStart > boundaryCount + 2) items.push('ellipsis');
  else if (boundaryCount + 1 < pageCount - boundaryCount) items.push(boundaryCount + 1);
  items.push(...range(siblingsStart, siblingsEnd));
  if (siblingsEnd < pageCount - boundaryCount - 1) items.push('ellipsis');
  else if (pageCount - boundaryCount > boundaryCount) items.push(pageCount - boundaryCount);
  items.push(...endPages);
  return items;
}

/**
 * 페이지 이동. `<nav aria-label>` 안 버튼 목록 — 현재 페이지만 `aria-current="page"`, 생략 기호는 장식, 이전·다음은 양끝에서
 * 비활성. 상태는 앱이 갖는다(제어형, URL에 두는 것을 권한다). 라우터를 모른다 — 링크가 필요하면 앱이 onPageChange에서 이동한다.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  boundaryCount = 1,
  showFirstLast = false,
  disabled = false,
  'aria-label': ariaLabel = 'Pagination',
  labels,
  className,
}: PaginationProps) {
  if (pageCount < 1) return null;
  const text: PaginationLabels = { ...DEFAULT_LABELS, ...labels };
  const current = Math.min(Math.max(page, 1), pageCount);
  const go = (next: number) => {
    if (disabled || next < 1 || next > pageCount || next === current) return;
    onPageChange(next);
  };
  const classes = [styles.nav, className].filter(Boolean).join(' ');
  const items = paginationRange(current, pageCount, { siblingCount, boundaryCount });
  const atStart = disabled || current <= 1;
  const atEnd = disabled || current >= pageCount;

  const arrow = (
    key: string,
    label: string,
    target: number,
    isDisabled: boolean,
    Icon: typeof ChevronLeft,
  ) => (
    <li key={key} className={styles.item}>
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        disabled={isDisabled}
        onClick={() => go(target)}
      >
        <Icon size={16} aria-hidden="true" />
      </button>
    </li>
  );

  return (
    <nav aria-label={ariaLabel} className={classes}>
      <ul className={styles.list}>
        {showFirstLast ? arrow('first', text.first, 1, atStart, ChevronsLeft) : null}
        {arrow('previous', text.previous, current - 1, atStart, ChevronLeft)}
        {items.map((item, index) =>
          item === 'ellipsis' ? (
            <li key={`ellipsis-${index}`} className={styles.item}>
              <span className={styles.ellipsis} aria-hidden="true">
                …
              </span>
            </li>
          ) : (
            <li key={item} className={styles.item}>
              <button
                type="button"
                className={[styles.button, item === current ? styles.current : null]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={text.page(item)}
                aria-current={item === current ? 'page' : undefined}
                disabled={disabled}
                onClick={() => go(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
        {arrow('next', text.next, current + 1, atEnd, ChevronRight)}
        {showFirstLast ? arrow('last', text.last, pageCount, atEnd, ChevronsRight) : null}
      </ul>
    </nav>
  );
}
