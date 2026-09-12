// 홈 타일·사이드바 배지가 함께 쓰는 카운트(서버 전용). 같은 소스여야 둘이 어긋나지 않는다
// — decisions/navigation.md. Run 스키마(B1e)·발행(Phase 2) 전까지 해당 값은 0.
import {
  countPendingApproval,
  countTopicsByStatus,
  prisma,
  type QueueSections,
} from '@galley/pipeline';

export interface NavCounts {
  /** 대기 주제 수. 마지막 적재 기준이다. 조회 실패 시 0. */
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

async function safeWaiting(): Promise<number> {
  try {
    return await countTopicsByStatus(prisma, '대기');
  } catch {
    return 0;
  }
}

/**
 * **적재하지 않는다.** 셸이 매 요청 부르므로 여기서 파일→DB 적재까지 하면 모든 라우트가
 * 파일을 읽고 DB에 쓰게 되고, 같은 요청의 페이지 적재와 병렬로 돌아 경합이 된다
 * (그렇게 행이 중복된 적이 있다 — 2026-09-13). 파일과의 동기화는 큐·홈 화면과
 * "파일에서 다시 불러오기"가 맡는다. decisions/queue-sync-direction.md "적재를 부르는 곳".
 *
 * `preloaded`를 주면 방금 읽은 섹션을 그대로 센다 — 홈처럼 이미 적재한 화면이 같은 요청에서
 * DB를 또 세지 않게, 그리고 화면과 배지가 **같은 순간의 값**을 보게.
 */
export async function getNavCounts(preloaded?: QueueSections): Promise<NavCounts> {
  return {
    waiting: preloaded !== undefined ? preloaded.대기.length : await safeWaiting(),
    pendingApproval: await safePendingApproval(),
    // TODO(Phase 2): 승인됐지만 채널 미발행 수
    publishPending: 0,
    // TODO(Phase 2): 이번 달 RunStep 비용 합
    monthlyCostUsd: 0,
  };
}
