'use client';
import { useState, useTransition } from 'react';
import { Button, InlineAlert, Menu } from 'galley-ui';
import type { MoveQueueTopicInput, QueueStatus } from '@galley/pipeline';
import type { QueueMoveResult } from '../../../lib/queue-move';
import {
  EDIT_EVIDENCE_ID,
  parseMoveTarget,
  queueRowMenuEntries,
  RUN_NOW_ID,
} from '../../../lib/queue-row-menu';
import { useRunStart } from '../_components/RunStart';
import { useTopicEvidenceEdit } from './TopicEvidenceEdit';
import styles from './QueueRowMenu.module.css';

// 큐 행 끝 ⋮ 메뉴. move는 Server Action(테스트에선 가짜). 이동 성공 시 액션이 화면을 다시 그린다.
// "지금 실행"은 페이지의 실행 시작 Dialog(RunStartProvider)를, "근거 편집"은 근거 편집 Dialog(TopicEvidenceProvider)를 연다.
export function QueueRowMenu({
  topicId,
  title,
  status,
  index,
  runDisabledReason,
  move,
}: {
  /** 주제 키 = QueueItem.id — 실행 시작에 넘긴다. */
  topicId: string;
  title: string;
  status: QueueStatus;
  /** 섹션 안에서의 0기반 위치(카테고리 필터 전 기준). */
  index: number;
  /** "지금 실행"을 끌 사유(파일에서 사라짐·`(기존 글)` 편). 판정은 서버(lib/queue-view), 여기는 문구만 받는다. */
  runDisabledReason?: string;
  move: (input: MoveQueueTopicInput) => Promise<QueueMoveResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const openRunStart = useRunStart();
  const openEvidenceEdit = useTopicEvidenceEdit();

  return (
    <div className={styles.menu}>
      {error !== null ? (
        // 목록 행 안이라 상자 없이(plain). danger라 role=alert.
        <InlineAlert tone="danger" variant="plain">
          {error}
        </InlineAlert>
      ) : null}
      <Menu
        trigger={
          <Button variant="ghost" size="sm" aria-label={`${title} 메뉴`} disabled={pending}>
            ⋮
          </Button>
        }
        items={queueRowMenuEntries(status, { runDisabledReason })}
        onSelect={(id) => {
          if (id === RUN_NOW_ID) {
            openRunStart({ id: topicId, title });
            return;
          }
          if (id === EDIT_EVIDENCE_ID) {
            openEvidenceEdit({ id: topicId, title });
            return;
          }
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
