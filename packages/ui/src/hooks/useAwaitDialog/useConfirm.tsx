'use client';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../primitives/Dialog';
import { useAwaitDialog } from './useAwaitDialog';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  /** 질문 한 줄 — dialog의 접근성 이름. */
  title: string;
  description?: ReactNode;
  /** 기본 '확인'. */
  confirmLabel?: string;
  /** 기본 '취소'. */
  cancelLabel?: string;
  /** danger면 확인 버튼이 빨강(되돌릴 수 없는 액션). 기본 default. */
  tone?: ConfirmTone;
}

export interface UseConfirmReturn {
  /** 확인 다이얼로그를 열고 확인이면 true, 취소·Esc·바깥 클릭·닫기 버튼이면 false. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** 소비자가 트리에 한 번 렌더한다. */
  element: ReactNode;
}

/**
 * `useAwaitDialog<boolean>` 위에 Dialog + 버튼 두 개. `if (!(await confirm({ title }))) return;` 한 줄로 쓴다.
 * 열린 채 다시 부르면 이전 것은 false로 끝난다. 언마운트되면 대기 중인 것도 false.
 */
export function useConfirm(): UseConfirmReturn {
  const { open, element } = useAwaitDialog<boolean>(false);
  const confirm = useCallback(
    ({
      title,
      description,
      confirmLabel = '확인',
      cancelLabel = '취소',
      tone = 'default',
    }: ConfirmOptions) =>
      open(({ open: isOpen, onOpenChange, resolve, cancel }) => (
        <Dialog
          open={isOpen}
          onOpenChange={onOpenChange}
          title={title}
          description={description}
          footer={
            <>
              <Button variant="secondary" onClick={cancel}>
                {cancelLabel}
              </Button>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                onClick={() => resolve(true)}
              >
                {confirmLabel}
              </Button>
            </>
          }
        />
      )),
    [open],
  );
  return { confirm, element };
}
