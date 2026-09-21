'use client';
import { Fragment, createElement, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** 렌더 함수가 받는 것. `open`·`onOpenChange`는 Dialog에 그대로 넘기고, 결과는 `resolve`로 돌려준다. */
export interface AwaitDialogRenderProps<TResult> {
  /** Dialog의 `open`. 결과가 정해진 뒤 닫힘 애니메이션 동안 false로 한 번 더 렌더된다. */
  open: boolean;
  /** Dialog의 `onOpenChange`. false(Esc·바깥 클릭·닫기 버튼)면 cancel 값으로 resolve한다. */
  onOpenChange: (open: boolean) => void;
  /** 결과를 돌려주고 닫는다. */
  resolve: (result: TResult) => void;
  /** cancel 값으로 resolve하고 닫는다(취소 버튼용). */
  cancel: () => void;
}

export type AwaitDialogRender<TResult> = (dialog: AwaitDialogRenderProps<TResult>) => ReactNode;

export interface UseAwaitDialogReturn<TResult> {
  /**
   * 다이얼로그를 열고 결과를 기다린다. 열린 채 다시 부르면 이전 Promise는 cancel 값으로 끝나고
   * 새 것으로 바뀐다(중첩 없음). 참조가 안정적이라 의존성 배열에 넣어도 된다.
   */
  open: (render: AwaitDialogRender<TResult>) => Promise<TResult>;
  /** 소비자가 트리에 한 번 렌더한다. 한 번도 열지 않았으면 null. */
  element: ReactNode;
}

interface DialogState<TResult> {
  render: AwaitDialogRender<TResult>;
  open: boolean;
  /** open()마다 1씩 오른다. element의 key라 새로 열면 렌더 함수가 그린 서브트리가 다시 마운트된다. */
  session: number;
}

/**
 * Promise로 결과를 기다리는 다이얼로그. 훅은 열림 상태와 Promise만 갖고 UI는 소비자가 렌더 함수로
 * 그린다(Dialog 프리미티브를 그대로 쓴다). 핸들러에서 `const r = await open(...)` 한 줄이면 된다.
 *
 * - 닫힘은 언제나 resolve(reject 없음). Esc·바깥 클릭·닫기 버튼·`cancel()`은 `cancelValue`로.
 * - 언마운트되면 대기 중인 Promise를 `cancelValue`로 끝내고 상태는 건드리지 않는다. 언마운트 뒤 stale
 *   클로저로 `open()`하면 바로 `cancelValue`로 끝난다(영원히 pending인 Promise를 만들지 않는다).
 * - 결과가 정해진 뒤에도 `element`는 남는다(Dialog가 `open=false`로 닫힘 애니메이션을 마친다).
 *   새로 `open()`하면 서브트리는 다시 마운트된다 — 렌더 함수가 돌려준 컴포넌트의 `useState`가
 *   이전 세션의 값을 물려받지 않는다.
 * - 렌더 함수는 소비자 렌더 중에 불린다. 훅을 쓰지 말고, 상태가 필요하면 컴포넌트를 돌려준다.
 *   클로저는 `open()` 시점 값으로 고정된다(열려 있는 동안 소비자 상태가 바뀌어도 반영되지 않는다).
 * - 마운트 effect에서 열어도 되지만 그 컴포넌트 자신의 effect까지만 — 자식의 마운트 effect에서 열면
 *   React StrictMode(개발)의 언마운트 시뮬레이션에 첫 Promise가 `cancelValue`로 끝난다.
 * - 결과가 정해진 직후 같은 틱에 다시 `open()`하면(`await a(); await b()` 연쇄) 닫힘과 열림이 한 번에
 *   반영되어 Dialog는 닫히지 않고 내용만 바뀐다.
 */
export function useAwaitDialog<TResult>(cancelValue: TResult): UseAwaitDialogReturn<TResult> {
  const [dialog, setDialog] = useState<DialogState<TResult> | null>(null);
  const pending = useRef<((result: TResult) => void) | null>(null);
  const mounted = useRef(false);
  const cancelRef = useRef(cancelValue);

  useEffect(() => {
    cancelRef.current = cancelValue;
  }, [cancelValue]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const resolve = pending.current;
      pending.current = null;
      resolve?.(cancelRef.current);
    };
  }, []);

  const settle = useCallback((result: TResult) => {
    const resolve = pending.current;
    pending.current = null;
    if (mounted.current) {
      setDialog((current) =>
        current === null || !current.open ? current : { ...current, open: false },
      );
    }
    resolve?.(result);
  }, []);

  const cancel = useCallback(() => settle(cancelRef.current), [settle]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next) cancel();
    },
    [cancel],
  );

  const open = useCallback((render: AwaitDialogRender<TResult>) => {
    // 열린 채 다시 열면 이전 것은 취소로 끝낸다. 상태는 새 렌더 함수로 바로 덮는다.
    const previous = pending.current;
    pending.current = null;
    previous?.(cancelRef.current);
    if (!mounted.current) return Promise.resolve(cancelRef.current);
    return new Promise<TResult>((resolve) => {
      pending.current = resolve;
      setDialog((current) => ({ render, open: true, session: (current?.session ?? 0) + 1 }));
    });
  }, []);

  const element =
    dialog === null
      ? null
      : createElement(
          Fragment,
          { key: dialog.session },
          dialog.render({ open: dialog.open, onOpenChange, resolve: settle, cancel }),
        );

  return { open, element };
}
