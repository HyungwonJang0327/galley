'use client';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import styles from './Tooltip.module.css';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /**
   * 트리거 요소(예: <Button aria-label="…" />). 툴팁이 이 요소에 props·ref를 병합하므로 받은
   * props를 DOM 요소까지 넘기는 요소여야 한다(props를 버리는 래퍼 컴포넌트는 열리지 않는다).
   */
  trigger: ReactElement;
  /** 툴팁 내용. 한 줄 짧은 텍스트 권장. */
  content: ReactNode;
  /** 트리거 기준 위치. 접힌 사이드바 라벨은 right. */
  side?: TooltipSide;
  /** 마우스 올린 뒤 열리기까지 ms(키보드 포커스는 즉시). */
  delay?: number;
  /** popup에 병합. */
  className?: string;
}

/**
 * 툴팁(Base UI). hover·focus로 열리고 Esc·이탈로 닫힌다. 보조 정보 전용 — 트리거의 접근성
 * 이름을 대신하지 않는다(아이콘 버튼이면 aria-label을 따로 준다).
 */
export function Tooltip({ trigger, content, side = 'top', delay, className }: TooltipProps) {
  const popupClass = [styles.popup, className].filter(Boolean).join(' ');
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={trigger} delay={delay} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className={styles.positioner} side={side} sideOffset={6}>
          {/* Base UI 1.8 Popup은 role을 붙이지 않는다 — 보조기기·테스트가 찾도록 명시. */}
          <BaseTooltip.Popup role="tooltip" className={popupClass}>
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
