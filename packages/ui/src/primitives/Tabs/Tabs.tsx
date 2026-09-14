'use client';
import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  /** onValueChange에 넘기는 식별자. 목록 안에서 유일해야 한다. */
  value: string;
  label: string;
  /** 라벨 옆 개수. 0도 그대로 표시. */
  count?: number;
  disabled?: boolean;
  /** 이 탭이 활성일 때 아래에 그릴 내용. 없으면 탭 줄만 그린다(내용은 앱이 밖에서 바꿈). */
  content?: ReactNode;
}

export interface TabsProps {
  /** 제어형만. items 중 하나의 value. */
  value: string;
  onValueChange: (value: string) => void;
  items: readonly TabItem[];
  /** 탭 목록의 접근성 이름. */
  'aria-label'?: string;
  /** 루트에 병합. */
  className?: string;
}

/**
 * 페이지 안 상태 탭(Base UI). 화살표 키 이동·포커스 시 활성화는 Base UI 기본값.
 * URL로 이동하는 툴바 탭(ListToolbarTab)과 구분한다 — 이쪽은 같은 화면 안에서 내용을 바꾼다.
 */
export function Tabs({
  value,
  onValueChange,
  items,
  'aria-label': ariaLabel,
  className,
}: TabsProps) {
  const classes = [styles.root, className].filter(Boolean).join(' ');
  const panels = items.filter((item) => item.content !== undefined);
  return (
    <BaseTabs.Root
      className={classes}
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string') onValueChange(next);
      }}
    >
      <BaseTabs.List className={styles.list} aria-label={ariaLabel}>
        {items.map((item) => (
          <BaseTabs.Tab
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={styles.tab}
          >
            <span className={styles.label}>{item.label}</span>
            {item.count !== undefined ? <span className={styles.count}>{item.count}</span> : null}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {panels.map((item) => (
        <BaseTabs.Panel key={item.value} value={item.value} className={styles.panel}>
          {item.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  );
}
