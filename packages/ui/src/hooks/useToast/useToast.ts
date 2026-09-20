'use client';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ToastTone } from '../../primitives/Toast/Toast';

export interface ToastOptions {
  /** 굵은 한 줄 — 토스트의 접근성 이름. */
  title: ReactNode;
  /** 보조 문구. */
  description?: ReactNode;
  /** 색·아이콘·낭독 세기. danger·warning은 끼어들어 읽힌다. 기본 info. */
  tone?: ToastTone;
  /** 자동 닫힘까지 ms. 0이면 닫기 버튼·Esc로만. 없으면 Provider의 timeout. */
  duration?: number;
}

export interface UseToastReturn {
  /** 토스트를 띄우고 id를 돌려준다. */
  toast: (options: ToastOptions) => string;
  /** id를 주면 그것만, 없으면 전부 닫는다. */
  close: (id?: string) => void;
}

/**
 * `ToastProvider` 아래에서 토스트를 띄운다. 돌려주는 객체는 Provider가 살아 있는 동안 참조가 안정적이다.
 * Provider 밖에서 부르면 Base UI가 컨텍스트 오류를 던진다(프로그래머 오류).
 */
export function useToast(): UseToastReturn {
  const manager = BaseToast.useToastManager();
  return useMemo(
    () => ({
      toast: ({ title, description, tone = 'info', duration }) =>
        manager.add({
          title,
          description,
          type: tone,
          priority: tone === 'danger' || tone === 'warning' ? 'high' : 'low',
          timeout: duration,
        }),
      close: (id) => manager.close(id),
    }),
    [manager],
  );
}
