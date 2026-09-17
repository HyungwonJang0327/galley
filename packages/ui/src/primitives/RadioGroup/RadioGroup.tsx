'use client';
import { Radio as BaseRadio } from '@base-ui/react/radio';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { ItemContent } from '../ItemContent';
import styles from './RadioGroup.module.css';

export interface RadioItem {
  value: string;
  label: string;
  /** label 아래 한 줄 회색 보조 텍스트. 라디오의 설명(aria-describedby)이 된다. */
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** 제어형만. null = 아무것도 고르지 않음. */
  value: string | null;
  onValueChange: (value: string) => void;
  items: RadioItem[];
  /** 그룹의 접근성 이름. */
  'aria-label': string;
  /** 배치 방향. 방향키는 어느 쪽이든 네 방향 모두 듣는다(Base UI 기본값). */
  orientation?: 'vertical' | 'horizontal';
  /** 그룹 전체 비활성. */
  disabled?: boolean;
  /** 폼 제출용 이름. */
  name?: string;
  /** 그룹 요소에 병합. */
  className?: string;
}

/**
 * 라디오 그룹(Base UI). 항목마다 역할 radio인 원 + 라벨·보조를 <label>로 감싸 글자를 눌러도 선택된다.
 * 방향키 이동(이동 = 선택)·roving tabindex·폼 hidden input은 Base UI 기본값.
 */
export function RadioGroup({
  value,
  onValueChange,
  items,
  'aria-label': ariaLabel,
  orientation = 'vertical',
  disabled,
  name,
  className,
}: RadioGroupProps) {
  const baseId = useId();
  const classes = [styles.group, styles[orientation], className].filter(Boolean).join(' ');
  return (
    <BaseRadioGroup
      className={classes}
      value={value}
      onValueChange={(next) => {
        // Base UI 타입은 null을 허용하지만 실제로는 고른 항목의 value만 온다.
        if (next !== null) onValueChange(next);
      }}
      disabled={disabled}
      name={name}
      aria-label={ariaLabel}
      aria-orientation={orientation}
    >
      {items.map((item, index) => {
        const itemDisabled = disabled || item.disabled;
        // 이름은 라벨만, 보조 텍스트는 설명으로 — label 전체가 이름이 되면 보조까지 한 덩어리로 읽힌다.
        const labelId = `${baseId}-${index}-label`;
        const descriptionId =
          item.description !== undefined ? `${baseId}-${index}-desc` : undefined;
        return (
          <label key={item.value} className={styles.item} data-disabled={itemDisabled || undefined}>
            <BaseRadio.Root
              className={styles.radio}
              value={item.value}
              disabled={item.disabled}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
            >
              <BaseRadio.Indicator className={styles.dot} />
            </BaseRadio.Root>
            <ItemContent
              label={<span id={labelId}>{item.label}</span>}
              description={
                item.description !== undefined ? (
                  <span id={descriptionId}>{item.description}</span>
                ) : undefined
              }
            />
          </label>
        );
      })}
    </BaseRadioGroup>
  );
}
