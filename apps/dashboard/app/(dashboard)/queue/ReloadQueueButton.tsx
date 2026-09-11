'use client';
import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@galley/ui';
import type { QueueReloadResult } from '../../../lib/queue-reload';
import styles from './ReloadQueueButton.module.css';

const REQUEST_FAILED: QueueReloadResult = {
  ok: false,
  error: { code: 'QUEUE_LOAD_FAILED', message: '갱신 요청이 실패했습니다. 다시 눌러 주세요.' },
};

// 큐 화면 헤더 버튼: 주제_큐.md → DB 재적재(AI 호출 없음). reload는 Server Action(테스트에선 가짜).
export function ReloadQueueButton({ reload }: { reload: () => Promise<QueueReloadResult> }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<QueueReloadResult | null>(null);

  const message = result === null ? '' : result.ok ? result.data.summary : result.error.message;
  const messageClass = [styles.message, result?.ok === false ? styles.error : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.reload}>
      <p role="status" className={messageClass}>
        {message}
      </p>
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              setResult(await reload());
            } catch {
              setResult(REQUEST_FAILED);
            }
          })
        }
      >
        <RefreshCw size={14} aria-hidden="true" />
        {pending ? '불러오는 중…' : '파일에서 다시 불러오기'}
      </Button>
    </div>
  );
}
