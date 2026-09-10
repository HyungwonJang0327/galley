// 큐 상태 → Badge variant. 색 규칙은 decisions/layout.md §5, ui는 variant 이름만 안다.
// Run 상태(실행 중·승인 대기·실패)는 Run 스키마(B1e)가 생긴 뒤 붙인다.
import type { BadgeProps } from '@galley/ui';
import type { QueueStatus } from '@galley/pipeline';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const QUEUE_STATUS_VARIANT: Record<QueueStatus, BadgeVariant> = {
  대기: 'info',
  후보: 'neutral',
  보류: 'neutral',
  완료: 'success',
};

export function queueStatusBadgeVariant(status: QueueStatus): BadgeVariant {
  return QUEUE_STATUS_VARIANT[status];
}
