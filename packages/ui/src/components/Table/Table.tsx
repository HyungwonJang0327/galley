import type { ComponentProps, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import styles from './Table.module.css';

export type TableDensity = 'md' | 'sm';
export type SortDirection = 'ascending' | 'descending';
export type TableAlign = 'start' | 'center' | 'end';

export interface TableProps extends ComponentProps<'table'> {
  /** 행 높이. 기본 md. */
  density?: TableDensity;
  /** 머리글을 스크롤 컨테이너 위에 고정. 컨테이너는 바깥(래퍼 div)이 overflow:auto다. */
  stickyHeader?: boolean;
  /** 래퍼(div)에 병합 — 자리 잡기용. 나머지 props는 table에. */
  className?: string;
}

/**
 * 표현 전용 표. `<div>`(가로 스크롤) 안 네이티브 `<table>`. 어떤 열을 어떻게 정렬·필터할지는 앱이 정하고 정렬된 행을 넘긴다
 * (decisions/table-component.md). 가상화·그룹화 없음.
 */
export function Table({ density = 'md', stickyHeader = false, className, ...props }: TableProps) {
  const classes = [styles.wrap, className].filter(Boolean).join(' ');
  return (
    <div className={classes}>
      <table
        className={styles.table}
        data-density={density}
        data-sticky-header={stickyHeader || undefined}
        {...props}
      />
    </div>
  );
}

export type TableHeadProps = ComponentProps<'thead'>;
export function TableHead({ className, ...props }: TableHeadProps) {
  return <thead className={[styles.head, className].filter(Boolean).join(' ')} {...props} />;
}

export type TableBodyProps = ComponentProps<'tbody'>;
export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody className={[styles.body, className].filter(Boolean).join(' ')} {...props} />;
}

export interface TableRowProps extends ComponentProps<'tr'> {
  /** 선택된 행 표시(틴트 배경). 선택 상태는 앱이 갖는다. */
  selected?: boolean;
  /** 행 전체가 눌리는 표시(hover 배경). 클릭 처리는 앱(onClick)이. */
  interactive?: boolean;
}
export function TableRow({ selected, interactive, className, ...props }: TableRowProps) {
  return (
    <tr
      className={[styles.row, className].filter(Boolean).join(' ')}
      data-selected={selected || undefined}
      data-interactive={interactive || undefined}
      aria-selected={selected ? true : undefined}
      {...props}
    />
  );
}

/** DOM `align` 속성(폐기됨)과 이름이 겹쳐 뺀다 — 우리 `align`은 start|center|end. */
export interface TableHeaderCellProps extends Omit<ComponentProps<'th'>, 'align'> {
  align?: TableAlign;
  /** 숫자 열 — 오른쪽 정렬·tabular-nums. 본문 셀도 같은 값을 준다. */
  numeric?: boolean;
  /**
   * 이 열의 현재 정렬. 있으면 `aria-sort`를 단다 — 한 번에 한 열만(앱이 지킨다).
   * `onSort`가 있으면 머리글이 버튼이 되고, 정렬 안 된 열은 양방향 화살표를 흐리게 보인다.
   */
  sortDirection?: SortDirection | null;
  onSort?: () => void;
}
export function TableHeaderCell({
  align,
  numeric,
  sortDirection = null,
  onSort,
  className,
  children,
  ...props
}: TableHeaderCellProps) {
  const classes = [
    styles.th,
    numeric ? styles.numeric : null,
    align === 'end' ? styles.alignEnd : align === 'center' ? styles.alignCenter : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const Icon =
    sortDirection === 'ascending'
      ? ArrowUp
      : sortDirection === 'descending'
        ? ArrowDown
        : ArrowUpDown;
  return (
    <th
      scope="col"
      className={classes}
      aria-sort={sortDirection ?? undefined}
      data-sorted={sortDirection ? '' : undefined}
      {...props}
    >
      {onSort ? (
        <button type="button" className={styles.sortButton} onClick={onSort}>
          <span className={styles.sortLabel}>{children}</span>
          <Icon size={14} aria-hidden="true" className={styles.sortIcon} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TableCellProps extends Omit<ComponentProps<'td'>, 'align'> {
  align?: TableAlign;
  numeric?: boolean;
}
export function TableCell({ align, numeric, className, ...props }: TableCellProps) {
  const classes = [
    styles.td,
    numeric ? styles.numeric : null,
    align === 'end' ? styles.alignEnd : align === 'center' ? styles.alignCenter : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <td className={classes} {...props} />;
}

export interface TableEmptyRowProps {
  /** 열 수 — 한 칸이 전체 폭을 차지한다. */
  colSpan: number;
  /** 보통 EmptyState나 한 줄 안내. */
  children: ReactNode;
  className?: string;
}
/** 행이 없을 때 본문에 넣는 한 줄. 표 머리글은 그대로 두어 열 구조가 보이게 한다. */
export function TableEmptyRow({ colSpan, children, className }: TableEmptyRowProps) {
  return (
    <tr className={styles.emptyRow}>
      <td colSpan={colSpan} className={[styles.emptyCell, className].filter(Boolean).join(' ')}>
        {children}
      </td>
    </tr>
  );
}
