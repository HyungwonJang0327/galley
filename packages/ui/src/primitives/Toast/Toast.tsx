'use client';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';
export type ToastPosition = 'top-right' | 'bottom-right';

export interface ToastProviderProps {
  children?: ReactNode;
  /** 뷰포트 모서리. 기본 top-right. */
  position?: ToastPosition;
  /** 한 번에 보이는 최대 개수. 넘치면 오래된 것부터 숨긴다(Base UI `limit`). 기본 3. */
  limit?: number;
  /** 자동 닫힘까지 ms. 0이면 자동으로 닫지 않는다. `toast({ duration })`이 우선. 기본 5000. */
  timeout?: number;
  /** 뷰포트(role="region")의 접근성 이름. F6으로 여기로 포커스가 온다. */
  label?: string;
  /** 각 토스트 닫기 버튼의 접근성 이름. */
  closeLabel?: string;
}

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

const isTone = (type: string | undefined): type is ToastTone => type !== undefined && type in ICONS;

/**
 * 토스트 뷰포트 + 컨텍스트(Base UI). 앱 루트(셸)에 한 번 두고, 띄우는 쪽은 `useToast()`.
 * 낭독: tone이 danger·warning이면 끼어들어 읽히고(`priority: high`), info·success는 하던 낭독 뒤에.
 * 키보드: F6으로 뷰포트 포커스, Esc·닫기 버튼으로 닫힘, 마우스 올리면 타이머 멈춤 — Base UI 기본.
 */
export function ToastProvider({
  children,
  position = 'top-right',
  limit = 3,
  timeout = 5000,
  label = '알림',
  closeLabel = '닫기',
}: ToastProviderProps) {
  const viewportClass = [styles.viewport, styles[position]].join(' ');
  return (
    <BaseToast.Provider limit={limit} timeout={timeout}>
      {children}
      <BaseToast.Portal>
        <BaseToast.Viewport className={viewportClass} aria-label={label}>
          <ToastList closeLabel={closeLabel} />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
}

function ToastList({ closeLabel }: { closeLabel: string }) {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => {
    const tone: ToastTone = isTone(toast.type) ? toast.type : 'info';
    const Icon = ICONS[tone];
    return (
      <BaseToast.Root
        key={toast.id}
        toast={toast}
        className={[styles.toast, styles[tone]].join(' ')}
      >
        <span className={styles.icon}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <BaseToast.Content className={styles.content}>
          {/* Base UI Title은 h2 — 토스트는 문서 개요에 들어갈 제목이 아니라 div로(Popover와 같은 판단). */}
          <BaseToast.Title className={styles.title} render={<div />} />
          <BaseToast.Description className={styles.description} />
        </BaseToast.Content>
        <BaseToast.Close className={styles.close} aria-label={closeLabel}>
          <X size={14} aria-hidden="true" />
        </BaseToast.Close>
      </BaseToast.Root>
    );
  });
}
