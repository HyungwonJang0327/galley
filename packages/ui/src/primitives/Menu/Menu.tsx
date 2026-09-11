'use client';
import { Menu as BaseMenu } from '@base-ui/react/menu';
import type { ReactElement, ReactNode } from 'react';
import { ItemContent } from '../ItemContent';
import styles from './Menu.module.css';

export interface MenuItem {
  /** onSelect에 넘기는 식별자. 목록 안에서 유일해야 한다. */
  id: string;
  label: string;
  /** label 아래 한 줄 회색 보조 텍스트. */
  description?: ReactNode;
  /** 우측 메타(회색·tabular-nums). */
  meta?: ReactNode;
  disabled?: boolean;
  /** disabled 사유. Phase 1은 native title로 노출(Tooltip 프리미티브 전). */
  disabledReason?: string;
}

/** 항목 사이 구분선. */
export interface MenuSeparator {
  type: 'separator';
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface MenuProps {
  /**
   * 열기 버튼 요소(예: <Button aria-label="…" />). 메뉴가 이 요소에 props·ref를 병합하므로
   * 받은 props를 DOM 버튼까지 넘기는 요소여야 한다(props를 버리는 래퍼 컴포넌트는 열리지 않는다).
   */
  trigger: ReactElement;
  items: readonly MenuEntry[];
  /** 항목을 고르면 그 id를 넘기고 메뉴는 닫힌다. */
  onSelect: (id: string) => void;
  /** 트리거 기준 팝업 정렬. 행 끝 ⋮ 메뉴가 기본이라 end. */
  align?: 'start' | 'end';
  /** popup에 병합. */
  className?: string;
}

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return 'type' in entry && entry.type === 'separator';
}

/**
 * 액션 메뉴(Base UI). 키보드 내비·타입어헤드·포털·뷰포트 충돌 시 뒤집기는 Base UI 기본값.
 * 아이템 레이아웃은 Select와 같은 ItemContent. 팝업 폭은 내용 폭, 최소·상한은 토큰.
 */
export function Menu({ trigger, items, onSelect, align = 'end', className }: MenuProps) {
  const popupClass = [styles.popup, className].filter(Boolean).join(' ');
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner className={styles.positioner} align={align} sideOffset={4}>
          <BaseMenu.Popup className={popupClass}>
            {items.map((entry, index) =>
              isSeparator(entry) ? (
                <BaseMenu.Separator key={`separator-${index}`} className={styles.separator} />
              ) : (
                <BaseMenu.Item
                  key={entry.id}
                  label={entry.label}
                  disabled={entry.disabled}
                  title={entry.disabled ? entry.disabledReason : undefined}
                  className={styles.item}
                  onClick={() => onSelect(entry.id)}
                >
                  <ItemContent
                    label={entry.label}
                    description={entry.description}
                    meta={entry.meta}
                  />
                </BaseMenu.Item>
              ),
            )}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
