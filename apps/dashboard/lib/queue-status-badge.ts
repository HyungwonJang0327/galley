// 큐 상태 → Badge tone. 색 규칙은 decisions/layout.md §5, ui는 tone 이름만 안다.
// Run 상태(실행 중·승인 대기·실패)는 Run 스키마(B1e)가 생긴 뒤 붙인다.
import type { BadgeTone } from 'galley-ui';
import type { QueueStatus } from '@galley/pipeline';

const QUEUE_STATUS_TONE: Record<QueueStatus, BadgeTone> = {
  waiting: 'info',
  candidate: 'neutral',
  hold: 'neutral',
  done: 'success',
};

export function queueStatusBadgeTone(status: QueueStatus): BadgeTone {
  return QUEUE_STATUS_TONE[status];
}
