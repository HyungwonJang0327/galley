// 큐 개수 조회 — **적재하지 않고 DB만 읽는다.**
// 셸(사이드바 배지)은 매 요청 도는데 거기서 파일→DB 적재까지 하면 모든 라우트에서
// 파일 읽기·DB 쓰기가 일어나고, 페이지 적재와 병렬로 돌아 경합이 된다.
// 적재는 큐·홈 화면과 "파일에서 다시 불러오기"가 한다. (decisions/queue-sync-direction.md)
import type { PrismaClient } from '@prisma/client';
import type { QueueStatus } from './queueFile';

/** 그 섹션의 주제 수. 마지막 적재 기준이다(파일을 다시 읽지 않는다). */
export function countTopicsByStatus(prisma: PrismaClient, status: QueueStatus): Promise<number> {
  return prisma.queueItem.count({ where: { status } });
}
