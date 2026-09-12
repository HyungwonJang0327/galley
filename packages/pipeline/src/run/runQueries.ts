// 실행(Run) 조회 — 홈 타일·사이드바 배지·실행 목록이 쓰는 최소 집합.
// 상태값 검증·전이는 상태 머신(B1a 🔒)이 맡고, 여기서는 읽기만 한다.
import type { PrismaClient } from '@prisma/client';

/** 검수 상태(사람이 보는 상태). 값 검증은 상태 머신 몫이라 여기선 상수만 둔다. */
export const RUN_STATUS = {
  running: '실행 중',
  pendingApproval: '승인 대기',
  done: '완료',
  failed: '실패',
} as const;

export interface RunSummary {
  id: string;
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

/** 주제(슬러그)의 최근 실행 하나 — 큐 완료 행의 실행 상세 링크에 쓴다. */
export async function findLatestRunForTopic(
  prisma: PrismaClient,
  topicSlug: string,
): Promise<RunSummary | null> {
  const row = await prisma.run.findFirst({
    where: { topicSlug },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
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
