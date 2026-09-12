'use client';
import { useState, useTransition } from 'react';
import { Button, Menu } from '@galley/ui';
import type { MoveQueueTopicInput, QueueStatus } from '@galley/pipeline';
import type { QueueMoveResult } from '../../../lib/queue-move';
import { parseMoveTarget, queueRowMenuEntries } from '../../../lib/queue-row-menu';
import styles from './QueueRowMenu.module.css';

// 큐 행 끝 ⋮ 메뉴. move는 Server Action(테스트에선 가짜). 이동 성공 시 액션이 화면을 다시 그린다.
export function QueueRowMenu({
  title,
  status,
  index,
  move,
}: {
  title: string;
  status: QueueStatus;
  /** 섹션 안에서의 0기반 위치(카테고리 필터 전 기준). */
  index: number;
  move: (input: MoveQueueTopicInput) => Promise<QueueMoveResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.menu}>
      {error !== null ? (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      ) : null}
      <Menu
        trigger={
          <Button variant="ghost" size="sm" aria-label={`${title} 메뉴`} disabled={pending}>
            ⋮
          </Button>
        }
        items={queueRowMenuEntries(status)}
        onSelect={(id) => {
          const to = parseMoveTarget(id);
          if (to === null) return;
          setError(null);
          startTransition(async () => {
            try {
              const result = await move({ from: status, to, index, title });
              if (!result.ok) setError(result.error.message);
            } catch {
              setError('이동 요청이 실패했습니다. 다시 시도해 주세요.');
            }
          });
        }}
      />
    </div>
  );
}
