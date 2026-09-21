'use client';
import { Toast as BaseToast } from '@base-ui/react/toast';
import { createContext } from 'react';

type BaseManager = ReturnType<typeof BaseToast.createToastManager>;

/** `useToast()`가 쓰는 명령 객체 — Provider가 살아 있는 동안 참조가 같고, 토스트 목록을 구독하지 않는다. */
export interface ToastManager {
  add: BaseManager['add'];
  close: BaseManager['close'];
}

/**
 * Base UI 매니저를 감싸 Provider가 구독하기 전에 들어온 명령을 모아 뒀다가 구독 직후 흘려보낸다.
 * React는 자식의 마운트 effect를 부모보다 먼저 돌리므로, 그냥 쓰면 자식 마운트 effect에서 띄운 첫
 * 토스트가 Base UI 구독(부모 Provider의 useEffect) 전에 발행돼 사라진다.
 */
export function createBufferedToastManager(): BaseManager & ToastManager {
  const inner = BaseToast.createToastManager();
  let subscribers = 0;
  let seq = 0;
  const pending: Array<() => void> = [];
  const flush = () => {
    for (const run of pending.splice(0)) run();
  };
  return {
    ...inner,
    ' subscribe': (listener) => {
      const unsubscribe = inner[' subscribe'](listener);
      subscribers += 1;
      flush();
      return () => {
        subscribers -= 1;
        unsubscribe();
      };
    },
    add: (options) => {
      if (subscribers > 0) return inner.add(options);
      // 구독 전: id를 여기서 정해 돌려주고, 발행은 구독 뒤로 미룬다(같은 id로 close도 가능).
      seq += 1;
      const id = options.id ?? `ui-toast-${seq}`;
      pending.push(() => inner.add({ ...options, id }));
      return id;
    },
    close: (id) => {
      if (subscribers > 0) inner.close(id);
      else pending.push(() => inner.close(id));
    },
  };
}

export const ToastManagerContext = createContext<ToastManager | null>(null);
