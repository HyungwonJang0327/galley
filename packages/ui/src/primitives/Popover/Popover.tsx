'use client';
import { Popover as BasePopover } from '@base-ui/react/popover';
import type { ReactElement, ReactNode } from 'react';
import styles from './Popover.module.css';

export type PopoverSide = 'top' | 'bottom' | 'left' | 'right';
export type PopoverAlign = 'start' | 'center' | 'end';

interface PopoverBaseProps {
  /**
   * 트리거 요소(예: <Button>자세히</Button>). 팝오버가 이 요소에 props·ref를 병합하므로 받은
   * props를 DOM 요소까지 넘기는 요소여야 한다(props를 버리는 래퍼 컴포넌트는 열리지 않는다).
   */
  trigger: ReactElement;
  /** 팝업 본문. 버튼·링크 같은 상호작용 요소를 넣어도 된다(Tooltip과의 차이). */
  children: ReactNode;
  /** 팝업 제목. 있으면 팝업(dialog)의 접근성 이름이 된다. */
  title?: ReactNode;
  /** title이 없을 때 팝업의 접근성 이름. */
  'aria-label'?: string;
  /** 트리거 기준 위치. 공간이 없으면 반대쪽으로 뒤집힌다(Base UI 충돌 회피). */
  side?: PopoverSide;
  /** 트리거 기준 정렬. */
  align?: PopoverAlign;
  /** popup에 병합. */
  className?: string;
}

/** 비제어: 팝오버가 열림 상태를 스스로 관리한다. `onOpenChange`는 관찰용으로만 줄 수 있다. */
interface PopoverUncontrolledProps {
  open?: undefined;
  onOpenChange?: (open: boolean) => void;
}

/**
 * 제어형: `open`을 주면 `onOpenChange`도 반드시 준다 — 빠지면 영영 안 닫히는 팝오버가 된다.
 * `open`에 `undefined`를 흘려보내도 된다(그때는 비제어로 돈다).
 */
interface PopoverControlledProps {
  open: boolean | undefined;
  onOpenChange: (open: boolean) => void;
}

/**
 * 열림 상태는 **선택**이다 — 주지 않으면 비제어. 이 패키지의 "제어형만" 원칙의 유일한 예외다:
 * 단순 정보 팝업은 앱이 열림 상태를 가질 이유가 없다. 밖에서 닫아야 할 때만 제어형으로 쓴다.
 */
export type PopoverProps = PopoverBaseProps & (PopoverUncontrolledProps | PopoverControlledProps);

/**
 * 팝오버(Base UI). 트리거를 누르면 열리고 Esc·바깥 클릭으로 닫힌다. 열리면 포커스가 팝업 안으로
 * 들어가고 닫히면 트리거로 돌아온다. 비모달 — 뒤 화면을 막지 않는다(막아야 하면 Dialog).
 */
export function Popover({
  trigger,
  children,
  title,
  'aria-label': ariaLabel,
  side = 'bottom',
  align = 'center',
  open,
  onOpenChange,
  className,
}: PopoverProps) {
  const popupClass = [styles.popup, className].filter(Boolean).join(' ');
  return (
    <BasePopover.Root
      open={open}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner
          className={styles.positioner}
          side={side}
          align={align}
          sideOffset={6}
        >
          <BasePopover.Popup className={popupClass} aria-label={ariaLabel}>
            {title !== undefined ? (
              // Base UI 기본은 <h2>. 팝오버는 비모달이라 뒤 화면과 같은 문서 개요에 섞인다 — 제목
              // 요소가 아닌 div로 그린다(aria-labelledby 연결은 그대로라 팝업 이름은 유지된다).
              <BasePopover.Title className={styles.title} render={<div />}>
                {title}
              </BasePopover.Title>
            ) : null}
            <div className={styles.body}>{children}</div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
