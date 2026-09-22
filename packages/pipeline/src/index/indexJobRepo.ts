// IndexJob·Repo 상태를 쓰는 **유일한 자리**(BE3 결정 ⑧ — 인덱서는 report만, 실행자가 여기서 기록한다).
// Run 쪽 PrismaWorkerRepo와 같은 규칙: 클레임은 조건부 updateMany + count로 원자적으로, heartbeat 공백은 interrupted로 회수.
import type { PrismaClient } from '@prisma/client';
import { INDEX_JOB_STATUS, REPO_STATUS } from './schema.ts';

/** 워커가 아직 놓지 않은 작업 상태 — 이 둘만 집어간다. */
const CLAIMABLE = [INDEX_JOB_STATUS.queued, INDEX_JOB_STATUS.interrupted];

export interface ClaimedIndexJob {
  id: string;
  kind: string;
  fromSha: string | null;
  modelId: string;
  progressCursor: string | null;
  progressDone: number;
  repo: { id: string; name: string; path: string; readOnly: boolean };
}

/** heartbeat가 끊긴 running을 interrupted로 되돌린다(진행 커서는 그대로라 다음 클레임이 이어 돈다). */
export async function reclaimStaleIndexJobs(prisma: PrismaClient, before: Date): Promise<number> {
  const { count } = await prisma.indexJob.updateMany({
    where: { status: INDEX_JOB_STATUS.running, heartbeat: { lt: before } },
    data: { status: INDEX_JOB_STATUS.interrupted, workerId: null },
  });
  return count;
}

const CLAIM_SELECT = {
  id: true,
  kind: true,
  fromSha: true,
  modelId: true,
  progressCursor: true,
  progressDone: true,
  repo: { select: { id: true, name: true, path: true, readOnly: true } },
} as const;

/** 동시 1개. 이 워커가 잡아 둔 것이 있으면 그것, 없으면 가장 오래된 queued·interrupted 하나를 원자적으로 잡는다. */
export async function claimIndexJob(
  prisma: PrismaClient,
  workerId: string,
  now: Date,
): Promise<{ job: ClaimedIndexJob; justClaimed: boolean } | null> {
  const mine = await prisma.indexJob.findFirst({
    where: { status: INDEX_JOB_STATUS.running, workerId },
    orderBy: { createdAt: 'asc' },
    select: CLAIM_SELECT,
  });
  if (mine !== null) return { job: mine, justClaimed: false };

  const candidate = await prisma.indexJob.findFirst({
    where: { status: { in: CLAIMABLE } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, startedAt: true },
  });
  if (candidate === null) return null;
  const { count } = await prisma.indexJob.updateMany({
    where: { id: candidate.id, status: { in: CLAIMABLE } },
    data: {
      status: INDEX_JOB_STATUS.running,
      workerId,
      heartbeat: now,
      startedAt: candidate.startedAt ?? now,
      errorCode: null,
      errorMessage: null,
    },
  });
  if (count === 0) return null;
  const job = await prisma.indexJob.findUniqueOrThrow({
    where: { id: candidate.id },
    select: CLAIM_SELECT,
  });
  return { job, justClaimed: true };
}

export async function beatIndexJob(prisma: PrismaClient, id: string, now: Date): Promise<void> {
  await prisma.indexJob.update({ where: { id }, data: { heartbeat: now } });
}

export interface IndexProgress {
  cursor: string;
  done: number;
  total: number;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
}

/** 배치 하나가 끝날 때마다 — 커서·진행·사용량 합산. 중단돼도 여기까지는 남아 다음 기동이 이어 돈다. */
export async function recordIndexProgress(
  prisma: PrismaClient,
  id: string,
  progress: IndexProgress,
  now: Date,
): Promise<void> {
  const current = await prisma.indexJob.findUniqueOrThrow({
    where: { id },
    select: { inputTokens: true, outputTokens: true, costUsd: true },
  });
  await prisma.indexJob.update({
    where: { id },
    data: {
      progressCursor: progress.cursor,
      progressDone: progress.done,
      progressTotal: progress.total,
      inputTokens: (current.inputTokens ?? 0) + progress.usage.inputTokens,
      outputTokens: (current.outputTokens ?? 0) + progress.usage.outputTokens,
      costUsd: (current.costUsd ?? 0) + progress.costUsd,
      heartbeat: now,
    },
  });
}

/** 종료 신호로 **반환** — 실패가 아니다. 커서는 그대로, 다음 기동이 곧바로 집어간다. */
export async function releaseIndexJob(prisma: PrismaClient, id: string, now: Date): Promise<void> {
  await prisma.indexJob.updateMany({
    where: { id, status: INDEX_JOB_STATUS.running },
    data: { status: INDEX_JOB_STATUS.interrupted, workerId: null, heartbeat: now },
  });
}

export type IndexJobEnd = { ok: true } | { ok: false; code: string; message?: string };

/** 작업 끝 + 리포 상태를 **한 트랜잭션**으로(IndexJob failed ↔ Repo error, done ↔ ready). */
export async function finishIndexJob(
  prisma: PrismaClient,
  job: { id: string; repoId: string; modelId: string },
  end: IndexJobEnd,
  headSha: string | null,
  now: Date,
): Promise<void> {
  await prisma.$transaction([
    prisma.indexJob.update({
      where: { id: job.id },
      data: {
        status: end.ok ? INDEX_JOB_STATUS.done : INDEX_JOB_STATUS.failed,
        workerId: null,
        finishedAt: now,
        errorCode: end.ok ? null : end.code,
        errorMessage: end.ok ? null : (end.message ?? null),
        ...(headSha !== null ? { toSha: headSha } : {}),
      },
    }),
    prisma.repo.update({
      where: { id: job.repoId },
      data: end.ok
        ? {
            status: REPO_STATUS.ready,
            headSha,
            lastIndexedAt: now,
            lastIndexModelId: job.modelId,
          }
        : { status: REPO_STATUS.error },
    }),
  ]);
}

/** 잡은 직후 — 리포는 인덱싱 중. */
export async function markRepoIndexing(prisma: PrismaClient, repoId: string): Promise<void> {
  await prisma.repo.update({ where: { id: repoId }, data: { status: REPO_STATUS.indexing } });
}
