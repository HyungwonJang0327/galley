'use client';
import { useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ToastTone } from '../../primitives/Toast';
import { ToastManagerContext } from '../../primitives/Toast/ToastContext';

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
 * `ToastProvider` 아래에서 토스트를 띄운다. 돌려주는 객체는 Provider가 살아 있는 동안 참조가 같고
 * (의존성 배열에 넣어도 안전), 토스트 목록을 구독하지 않아 토스트가 뜨고 닫혀도 이 훅을 쓰는
 * 컴포넌트는 리렌더되지 않는다. 마운트 effect에서 바로 띄워도 된다(Provider 구독 전 명령은 모아 뒀다 보냄).
 * Provider 밖에서 부르면 던진다(프로그래머 오류).
 */
export function useToast(): UseToastReturn {
  const manager = useContext(ToastManagerContext);
  if (manager === null) {
    throw new Error('useToast()는 <ToastProvider> 안에서만 쓸 수 있습니다.');
  }
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
