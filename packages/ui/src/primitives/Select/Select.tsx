'use client';
import { Select as BaseSelect } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { ItemContent } from '../ItemContent';
import styles from './Select.module.css';

export interface SelectItem {
  value: string;
  label: string;
  /** label 아래 한 줄 회색 보조 텍스트. */
  description?: ReactNode;
  /** 우측 메타(회색·tabular-nums). */
  meta?: ReactNode;
  disabled?: boolean;
  /** disabled 사유. Phase 1은 native title로 노출(Tooltip 프리미티브 전). */
  disabledReason?: string;
}

export interface SelectProps {
  /** 제어형만. null = 미선택(placeholder). */
  value: string | null;
  onValueChange: (value: string) => void;
  items: readonly SelectItem[];
  placeholder?: string;
  disabled?: boolean;
  /** 폼 제출용 hidden input 이름. */
  name?: string;
  'aria-label'?: string;
  /** 트리거에 병합. */
  className?: string;
}

/**
 * 단일 선택 Select(Base UI). 키보드 내비·타입어헤드·포털·뷰포트 충돌 시 뒤집기는 Base UI 기본값.
 * 팝업은 내용 폭(max-content)으로 넓어지되 트리거보다 좁아지지 않고, 토큰 상한까지만.
 */
export function Select({
  value,
  onValueChange,
  items,
  placeholder,
  disabled,
  name,
  'aria-label': ariaLabel,
  className,
}: SelectProps) {
  const triggerClass = [styles.trigger, className].filter(Boolean).join(' ');
  const lookup = items.map(({ value: v, label }) => ({ value: v, label }));

  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      items={lookup}
      disabled={disabled}
      name={name}
    >
      <BaseSelect.Trigger className={triggerClass} aria-label={ariaLabel}>
        <BaseSelect.Value className={styles.value} placeholder={placeholder} />
        <BaseSelect.Icon className={styles.icon}>
          <ChevronDown size={16} aria-hidden="true" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className={styles.positioner}
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <BaseSelect.Popup className={styles.popup}>
            <BaseSelect.List className={styles.list}>
              {items.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  label={item.label}
                  disabled={item.disabled}
                  title={item.disabled ? item.disabledReason : undefined}
                  className={styles.item}
                >
                  <BaseSelect.ItemIndicator className={styles.indicator}>
                    <Check size={14} aria-hidden="true" />
                  </BaseSelect.ItemIndicator>
                  <ItemContent
                    label={<BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>}
                    description={item.description}
                    meta={item.meta}
                  />
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
