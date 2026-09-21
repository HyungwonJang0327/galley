'use client';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import styles from './Dialog.module.css';

export interface DialogProps {
  /** 제어형만. 열림 상태는 앱이 갖는다. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 제목 = dialog의 접근성 이름. */
  title: string;
  /** 한 줄 설명(<p> 안) — 인라인만. 표·목록 같은 블록은 children에. */
  description?: ReactNode;
  /** 본문. */
  children?: ReactNode;
  /** 하단 버튼 슬롯(취소·확인 등). */
  footer?: ReactNode;
  /** 열기 버튼 요소(예: <Button />). 미지정 시 앱이 onOpenChange(true)로 연다. */
  trigger?: ReactElement;
  /** 우상단 닫기 버튼 접근성 이름. 기본 'Close' — 한국어 앱은 '닫기'를 넘긴다. */
  closeLabel?: string;
  /**
   * 열릴 때 포커스를 둘 요소. 기본은 popup 안 첫 tabbable(= 우상단 닫기 버튼). 확인 다이얼로그는
   * 위험한 액션이면 취소 버튼, 아니면 확인 버튼에 둔다(APG). false면 포커스를 옮기지 않는다.
   */
  initialFocus?: RefObject<HTMLElement | null> | false;
  /** popup에 병합. */
  className?: string;
}

/** 모달 Dialog(Base UI). 포커스 트랩·Esc·바깥 클릭 닫기는 Base UI 기본값. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  trigger,
  closeLabel = 'Close',
  initialFocus,
  className,
}: DialogProps) {
  const popupClass = [styles.popup, className].filter(Boolean).join(' ');
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={popupClass} initialFocus={initialFocus}>
          <div className={styles.header}>
            <BaseDialog.Title className={styles.title}>{title}</BaseDialog.Title>
            <BaseDialog.Close className={styles.close} aria-label={closeLabel}>
              <X size={16} aria-hidden="true" />
            </BaseDialog.Close>
          </div>
          {description !== undefined ? (
            <BaseDialog.Description className={styles.description}>
              {description}
            </BaseDialog.Description>
          ) : null}
          {children !== undefined ? <div className={styles.body}>{children}</div> : null}
          {footer !== undefined ? <div className={styles.footer}>{footer}</div> : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
