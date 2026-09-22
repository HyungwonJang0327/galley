// IndexJob·Repo 상태를 쓰는 **유일한 자리**(BE3 결정 ⑧ — 인덱서는 report만, 실행자가 여기서 기록한다).
// Run 쪽 PrismaWorkerRepo와 같은 규칙: 클레임은 조건부 updateMany + count로 원자적으로, heartbeat 공백은 interrupted로 회수.
// 클레임 뒤의 모든 쓰기는 **`{ id, workerId, status: running }` 조건**을 건다 — 회수돼 다른 워커가 잡은 작업에 옛 워커의 늦은
// 쓰기(진행·완료·실패)가 닿지 않게. 조건에 안 맞으면 false를 돌려주고 실행자는 손을 뗀다(`lost`).
import type { PrismaClient } from '@prisma/client';
import { INDEX_JOB_STATUS, REPO_STATUS } from './schema.ts';

/** 워커가 아직 놓지 않은 작업 상태 — 이 둘만 집어간다. */
const CLAIMABLE = [INDEX_JOB_STATUS.queued, INDEX_JOB_STATUS.interrupted];

export interface ClaimedIndexJob {
  id: string;
  kind: string;
  fromSha: string | null;
  /** 작업이 기준으로 삼는 커밋. enqueue가 채우고, 비어 있으면 실행자가 잡을 때 HEAD로 고정한다(pinIndexJobCommit). */
  toSha: string | null;
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
  toSha: true,
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
    select: { id: true, startedAt: true, inputTokens: true, outputTokens: true, costUsd: true },
  });
  if (candidate === null) return null;
  const { count } = await prisma.indexJob.updateMany({
    where: { id: candidate.id, status: { in: CLAIMABLE } },
    data: {
      status: INDEX_JOB_STATUS.running,
      workerId,
      heartbeat: now,
      startedAt: candidate.startedAt ?? now,
      // 사용량은 increment로 합산하므로 null을 0으로 깔아 둔다(SQLite에서 NULL + n = NULL).
      inputTokens: candidate.inputTokens ?? 0,
      outputTokens: candidate.outputTokens ?? 0,
      costUsd: candidate.costUsd ?? 0,
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

/** 잡을 때 기준 커밋을 고정한다 — 그 뒤 모든 배치·diff·완료 기록이 이 커밋 기준(틱 사이에 HEAD가 움직여도 섞이지 않는다). */
export async function pinIndexJobCommit(
  prisma: PrismaClient,
  id: string,
  toSha: string,
): Promise<void> {
  await prisma.indexJob.update({ where: { id }, data: { toSha } });
}

/** 이 워커가 지금 들고 있는 작업 — 클레임 뒤의 모든 쓰기 조건. */
export interface IndexJobOwner {
  id: string;
  workerId: string;
}
const owned = (owner: IndexJobOwner) => ({
  id: owner.id,
  workerId: owner.workerId,
  status: INDEX_JOB_STATUS.running,
});

/** 살아 있음을 알린다. 행이 없거나(리포 삭제) 남의 것이 됐으면 조용히 false. */
export async function beatIndexJob(
  prisma: PrismaClient,
  owner: IndexJobOwner,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.indexJob.updateMany({
    where: owned(owner),
    data: { heartbeat: now },
  });
  return count > 0;
}

export interface IndexProgress {
  /** 없으면 커서·진행은 두고 사용량만 합산한다(실패 직전 부분 과금). */
  cursor?: string;
  done?: number;
  total?: number;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
}

/**
 * 배치 하나가 끝날 때마다 — 커서·진행·사용량 합산(increment라 읽고-쓰기 경합이 없다). 중단돼도 여기까지는 남아 다음 기동이
 * 이어 돈다. 남의 작업이 됐으면 아무것도 쓰지 않고 false.
 */
export async function recordIndexProgress(
  prisma: PrismaClient,
  owner: IndexJobOwner,
  progress: IndexProgress,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.indexJob.updateMany({
    where: owned(owner),
    data: {
      ...(progress.cursor !== undefined ? { progressCursor: progress.cursor } : {}),
      ...(progress.done !== undefined ? { progressDone: progress.done } : {}),
      ...(progress.total !== undefined ? { progressTotal: progress.total } : {}),
      inputTokens: { increment: progress.usage.inputTokens },
      outputTokens: { increment: progress.usage.outputTokens },
      costUsd: { increment: progress.costUsd },
      heartbeat: now,
    },
  });
  return count > 0;
}

/** 종료 신호로 **반환** — 실패가 아니다. 커서는 그대로, 다음 기동이 곧바로 집어간다. */
export async function releaseIndexJob(
  prisma: PrismaClient,
  owner: IndexJobOwner,
  now: Date,
): Promise<boolean> {
  const { count } = await prisma.indexJob.updateMany({
    where: owned(owner),
    data: { status: INDEX_JOB_STATUS.interrupted, workerId: null, heartbeat: now },
  });
  return count > 0;
}

export type IndexJobEnd = { ok: true } | { ok: false; code: string; message?: string };

/**
 * 작업 끝 + 리포 상태를 **한 트랜잭션**으로(IndexJob failed ↔ Repo error, done ↔ ready).
 * 성공이면 `Repo.headSha = job.toSha`(작업이 기준으로 삼은 커밋, 지금 HEAD가 아니다) — 그래야 작업 중 들어온 커밋을 다음 enqueue가 증분으로 잡는다.
 */
export async function finishIndexJob(
  prisma: PrismaClient,
  job: IndexJobOwner & { repoId: string; modelId: string; toSha: string | null },
  end: IndexJobEnd,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.indexJob.updateMany({
      where: owned(job),
      data: {
        status: end.ok ? INDEX_JOB_STATUS.done : INDEX_JOB_STATUS.failed,
        workerId: null,
        finishedAt: now,
        errorCode: end.ok ? null : end.code,
        errorMessage: end.ok ? null : (end.message ?? null),
      },
    });
    // 남의 작업이 됐으면 리포도 건드리지 않는다 — 새 워커가 끝을 기록한다.
    if (count === 0) return false;
    await tx.repo.update({
      where: { id: job.repoId },
      data: end.ok
        ? {
            status: REPO_STATUS.ready,
            headSha: job.toSha,
            lastIndexedAt: now,
            lastIndexModelId: job.modelId,
          }
        : { status: REPO_STATUS.error },
    });
    return true;
  });
}

/** 잡은 직후 — 리포는 인덱싱 중. */
export async function markRepoIndexing(prisma: PrismaClient, repoId: string): Promise<void> {
  await prisma.repo.update({ where: { id: repoId }, data: { status: REPO_STATUS.indexing } });
}
