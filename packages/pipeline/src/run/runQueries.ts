// 실행(Run) 조회 — 홈 타일·사이드바 배지·실행 목록이 쓰는 최소 집합.
// 상태 어휘와 전이는 상태 머신(stateMachine.ts)이 소유하고, 여기서는 읽기만 한다.
import type { PrismaClient } from '@prisma/client';
import { RUN_STATUS } from './stateMachine.ts';

export interface RunSummary {
  id: string;
  /** 주제 키(QueueItem.id). 목록은 이 키로 묶고 최신 시도를 대표로 보여준다. */
  topicId: string;
  /** 이 주제의 몇 번째 시도인가(1부터). */
  attempt: number;
  topicSlug: string;
  topicTitle: string;
  status: string;
  modelId: string;
  startedAt: Date;
  finishedAt: Date | null;
}

/** 검수 상태별 개수(홈 타일·사이드바 배지가 같은 소스를 쓰도록). */
export async function countRunsByStatus(prisma: PrismaClient, status: string): Promise<number> {
  return prisma.run.count({ where: { status } });
}

/** 승인 대기 실행 수 — 홈 "승인 대기" 타일과 사이드바 배지. */
export async function countPendingApproval(prisma: PrismaClient): Promise<number> {
  return countRunsByStatus(prisma, RUN_STATUS.pendingApproval);
}

/** 최근 실행 목록(최신순). 홈 "최근 실행"·실행 이력 화면이 쓴다. */
export async function listRecentRuns(prisma: PrismaClient, limit = 5): Promise<RunSummary[]> {
  const rows = await prisma.run.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      topicId: true,
      attempt: true,
      topicSlug: true,
      topicTitle: true,
      status: true,
      modelId: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return rows;
}

/** 주제의 최근 시도 하나 — 큐 완료 행의 실행 상세 링크에 쓴다. 키는 QueueItem.id다. */
export async function findLatestRunForTopic(
  prisma: PrismaClient,
  topicId: string,
): Promise<RunSummary | null> {
  const row = await prisma.run.findFirst({
    where: { topicId },
    orderBy: { attempt: 'desc' },
    select: {
      id: true,
      topicId: true,
      attempt: true,
      topicSlug: true,
      topicTitle: true,
      status: true,
      modelId: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return row;
}
