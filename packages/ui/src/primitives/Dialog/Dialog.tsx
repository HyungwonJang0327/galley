'use client';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import styles from './Dialog.module.css';

export interface DialogProps {
  /** 제어형만. 열림 상태는 앱이 갖는다. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 제목 = dialog의 접근성 이름. */
  title: string;
  description?: ReactNode;
  /** 본문. */
  children?: ReactNode;
  /** 하단 버튼 슬롯(취소·확인 등). */
  footer?: ReactNode;
  /** 열기 버튼 요소(예: <Button />). 미지정 시 앱이 onOpenChange(true)로 연다. */
  trigger?: ReactElement;
  /** 우상단 닫기 버튼 접근성 이름. */
  closeLabel?: string;
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
  closeLabel = '닫기',
  className,
}: DialogProps) {
  const popupClass = [styles.popup, className].filter(Boolean).join(' ');
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      {trigger ? <BaseDialog.Trigger render={trigger} /> : null}
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={styles.backdrop} />
        <BaseDialog.Popup className={popupClass}>
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
