'use client';
import { useEffect, useRef, useState } from 'react';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { GripVertical } from 'lucide-react';
import { Badge, ListRow, ListRows } from '@galley/ui';
import type { MoveQueueTopicInput, QueueStatus, ReorderQueueTopicInput } from '@galley/pipeline';
import { dropToIndex, type DropEdge } from '../../../lib/queue-drag';
import type { QueueMoveResult } from '../../../lib/queue-move';
import type { QueueReorderResult } from '../../../lib/queue-reorder';
import type { QueueRowView } from '../../../lib/queue-view';
import { QueueRowMenu } from './QueueRowMenu';
import styles from './DraggableQueueRows.module.css';

// 대기 탭 행 목록(드래그로 순서 변경 — decisions/dnd-library.md: 로직은 앱, ListRow는 표현만).
// 놓자마자 저장한다(사용자 결정 2026-09-12). 실패 사유는 목록 위에 한 줄.

interface Props {
  rows: QueueRowView[];
  status: QueueStatus;
  badgeVariant: 'neutral' | 'info' | 'warning' | 'success' | 'danger';
  move: (input: MoveQueueTopicInput) => Promise<QueueMoveResult>;
  reorder: (input: ReorderQueueTopicInput) => Promise<QueueReorderResult>;
}

export function DraggableQueueRows({ rows, status, badgeVariant, move, reorder }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  return (
    <>
      {error !== null ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <ListRows>
        {rows.map((row) => (
          <DraggableRow
            key={`${row.index}-${row.title}`}
            row={row}
            status={status}
            badgeVariant={badgeVariant}
            isDragging={dragging === row.index}
            onDragStateChange={(active) => setDragging(active ? row.index : null)}
            onDrop={async (target) => {
              const to = dropToIndex(target);
              if (to === null) return;
              setError(null);
              const result = await reorder({ status, from: target.from, to, title: row.title });
              if (!result.ok) setError(result.error.message);
            }}
            move={move}
          />
        ))}
      </ListRows>
    </>
  );
}

function DraggableRow({
  row,
  status,
  badgeVariant,
  isDragging,
  onDragStateChange,
  onDrop,
  move,
}: {
  row: QueueRowView;
  status: QueueStatus;
  badgeVariant: Props['badgeVariant'];
  isDragging: boolean;
  onDragStateChange: (active: boolean) => void;
  onDrop: (target: { from: number; over: number; edge: DropEdge }) => void;
  move: Props['move'];
}) {
  const ref = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLSpanElement>(null);
  const [edge, setEdge] = useState<DropEdge | null>(null);

  useEffect(() => {
    const element = ref.current;
    const handle = handleRef.current;
    if (element === null || handle === null) return;

    const stopDraggable = draggable({
      element,
      dragHandle: handle,
      getInitialData: () => ({ index: row.index }),
      onDragStart: () => onDragStateChange(true),
      onDrop: () => onDragStateChange(false),
    });

    const stopDropTarget = dropTargetForElements({
      element,
      getData: () => ({ index: row.index }),
      onDrag: ({ location }) => {
        const rect = element.getBoundingClientRect();
        const y = location.current.input.clientY;
        setEdge(y < rect.top + rect.height / 2 ? 'top' : 'bottom');
      },
      onDragLeave: () => setEdge(null),
      onDrop: ({ source, location }) => {
        const rect = element.getBoundingClientRect();
        const y = location.current.input.clientY;
        const where: DropEdge = y < rect.top + rect.height / 2 ? 'top' : 'bottom';
        setEdge(null);
        const from = source.data.index;
        if (typeof from === 'number') onDrop({ from, over: row.index, edge: where });
      },
    });

    return () => {
      stopDraggable();
      stopDropTarget();
    };
  }, [row.index, row.title, onDragStateChange, onDrop]);

  const className = [
    isDragging ? styles.dragging : null,
    edge === 'top' ? styles.dropTop : null,
    edge === 'bottom' ? styles.dropBottom : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ListRow
      ref={ref}
      className={className || undefined}
      leading={
        <span
          ref={handleRef}
          className={styles.handle}
          aria-label={`${row.title} 순서 변경 핸들`}
          role="button"
          tabIndex={-1}
        >
          <GripVertical size={16} aria-hidden="true" />
        </span>
      }
      title={row.title}
      meta={row.meta}
      trailing={<Badge variant={badgeVariant}>{status}</Badge>}
      actions={<QueueRowMenu title={row.title} status={status} index={row.index} move={move} />}
    />
  );
}
