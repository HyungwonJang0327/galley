// 홈 타일·사이드바 배지가 함께 쓰는 카운트(서버 전용). 같은 소스여야 둘이 어긋나지 않는다
// — decisions/navigation.md. Run 스키마(B1e)·발행(Phase 2) 전까지 해당 값은 0.
import { countPendingApproval, prisma, type QueueSections } from '@galley/pipeline';
import { getQueueSections } from './queue-data';

export interface NavCounts {
  /** 주제_큐.md 대기 섹션 개수(실데이터). 로드 실패 시 0. */
  waiting: number;
  /** 승인 대기 실행 수(Run 스키마 조회). 실행이 없으면 0. */
  pendingApproval: number;
  /** 발행 대기 수. Phase 2 전까지 0. */
  publishPending: number;
  /** 이번 달 비용(USD). Phase 2 전까지 0. */
  monthlyCostUsd: number;
}

/**
 * DB가 아직 없거나(마이그레이션 전) 조회가 실패해도 화면 전체가 죽지 않게 0으로 둔다.
 * 이 카운트는 셸 레이아웃이 매 요청 부르므로, 던지면 모든 화면이 500이 된다.
 */
async function safePendingApproval(): Promise<number> {
  try {
    return await countPendingApproval(prisma);
  } catch {
    return 0;
  }
}

/**
 * preloaded를 주면 큐를 다시 적재하지 않는다 — 홈처럼 이미 섹션을 읽은 화면이
 * 같은 요청에서 파일→DB 재적재를 두 번 하지 않게.
 */
export async function getNavCounts(preloaded?: QueueSections): Promise<NavCounts> {
  const queue =
    preloaded !== undefined ? { ok: true as const, data: preloaded } : await getQueueSections();
  return {
    waiting: queue.ok ? queue.data.대기.length : 0,
    pendingApproval: await safePendingApproval(),
    // TODO(Phase 2): 승인됐지만 채널 미발행 수
    publishPending: 0,
    // TODO(Phase 2): 이번 달 RunStep 비용 합
    monthlyCostUsd: 0,
  };
}
