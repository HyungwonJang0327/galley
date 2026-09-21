'use client';
import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../primitives/Dialog';
import { confirmToneVariant } from '../../internal/tone';
import type { ConfirmTone } from '../../internal/tone';
import { useAwaitDialog } from './useAwaitDialog';

export interface AlertOptions {
  /** 안내 한 줄 — dialog의 접근성 이름. */
  title: string;
  description?: ReactNode;
  /** 기본 '확인'. */
  confirmLabel?: string;
  /** danger면 확인 버튼이 빨강. 기본 default. */
  tone?: ConfirmTone;
  /** 본문(Dialog의 children 슬롯). */
  children?: ReactNode;
}

export interface UseAlertReturn {
  /** 안내 다이얼로그를 열고 사용자가 닫으면(확인·Esc·바깥 클릭·닫기 버튼) 끝난다. */
  alert: (options: AlertOptions) => Promise<void>;
  /** 소비자가 트리에 한 번 렌더한다. */
  element: ReactNode;
}

/**
 * `useAwaitDialog<void>` 위에 Dialog + 확인 버튼 하나. `await alert({ title })` 뒤에 이어서 쓴다.
 * 어떻게 닫아도 결과는 같다(값 없음). 초기 포커스는 확인 버튼. 열린 채 다시 부르면 이전 것은 그냥 끝난다.
 * 이름은 alert지만 `role="alertdialog"`가 아니다 — 보조 기술이 끼어들어 읽지 않고, 바깥 클릭·Esc로도 닫힌다
 * (일반 Dialog). 끼어들어 읽혀야 하는 오류는 Toast danger나 InlineAlert alert tone을 쓴다.
 */
export function useAlert(): UseAlertReturn {
  const { open, element } = useAwaitDialog<void>(undefined);
  const confirmButton = useRef<HTMLButtonElement | null>(null);
  const alert = useCallback(
    ({ title, description, confirmLabel = '확인', tone = 'default', children }: AlertOptions) =>
      open(({ open: isOpen, onOpenChange, resolve }) => (
        <Dialog
          open={isOpen}
          onOpenChange={onOpenChange}
          title={title}
          description={description}
          initialFocus={confirmButton}
          footer={
            <Button
              ref={confirmButton}
              variant={confirmToneVariant(tone)}
              onClick={() => resolve()}
            >
              {confirmLabel}
            </Button>
          }
        >
          {children}
        </Dialog>
      )),
    [open],
  );
  return { alert, element };
}
