// WorkerRepo의 Prisma 구현. 워커 루프(runOnce)는 이걸 모르고, 여기만 스키마를 안다.
import type { PrismaClient } from '@prisma/client';
import {
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  STEP_STATUS,
  isStepName,
  isStepStatus,
} from '../run/stateMachine';
import type { ClaimedRun, WorkerRepo } from './WorkerDeps';

/** 워커가 아직 놓지 않은 실행 상태 — 이 둘만 집어간다. */
const CLAIMABLE = ['queued', 'interrupted'];

/**
 * **검수 상태가 `실행 중`인 것만** 집어간다. `workerState`만으로는 "사람 차례"를 표현할 수 없다
 * — 승인 대기는 워커가 손을 뗀 상태로 `queued`에 세워 두므로, 이 조건이 없으면 다시 집어간다.
 * 승인·수정 지시로 상태가 바뀌면(BW4) 그때 다시 대상이 된다.
 */
const WORKER_TURN = { status: RUN_STATUS.running, finishedAt: null } as const;

export function createPrismaWorkerRepo(prisma: PrismaClient): WorkerRepo {
  return {
    /**
     * heartbeat가 끊긴 running을 interrupted로 되돌린다. 다음 클레임이 집어가 **완료된 단계
     * 다음부터** 이어 돈다(decisions/run-location.md — 잠자기·재시작·강제 종료를 구분하지 않는다).
     */
    async reclaimStale(before) {
      const { count } = await prisma.run.updateMany({
        where: { ...WORKER_TURN, workerState: 'running', heartbeat: { lt: before } },
        data: { workerState: 'interrupted', workerId: null },
      });
      return count;
    },

    /**
     * 동시 1개. 클레임은 **조건부 updateMany + count 확인**으로 원자적으로 한다 —
     * 두 워커가 같은 실행을 잡지 못하게(SELECT 후 UPDATE는 그 사이가 비어 있다).
     */
    async claimRun(workerId, now) {
      const mine = await prisma.run.findFirst({
        where: { ...WORKER_TURN, workerState: 'running', workerId },
        orderBy: { startedAt: 'asc' },
      });
      if (mine !== null) return { run: await toClaimedRun(prisma, mine), justClaimed: false };

      const candidate = await prisma.run.findFirst({
        where: { ...WORKER_TURN, workerState: { in: CLAIMABLE } },
        orderBy: { startedAt: 'asc' },
        select: { id: true },
      });
      if (candidate === null) return null;

      const { count } = await prisma.run.updateMany({
        where: { id: candidate.id, ...WORKER_TURN, workerState: { in: CLAIMABLE } },
        data: { workerState: 'running', workerId, heartbeat: now },
      });
      // 그새 다른 워커가 채 갔다 — 다음 틱에 다시 본다.
      if (count === 0) return null;

      const claimed = await prisma.run.findUniqueOrThrow({ where: { id: candidate.id } });
      await ensureSteps(prisma, claimed.id);
      return { run: await toClaimedRun(prisma, claimed), justClaimed: true };
    },

    async beat(runId, now) {
      await prisma.run.update({ where: { id: runId }, data: { heartbeat: now } });
    },

    async startStep(runId, step, now) {
      await prisma.runStep.updateMany({
        where: { runId, name: step },
        data: { status: STEP_STATUS.running, startedAt: now },
      });
    },

    /** 성공이면 **실패 기록을 비운다** — 이전 실패의 흔적이 성공한 단계에 남으면 안 된다. */
    async finishStep(runId, step, outcome, now) {
      const succeeded = outcome.status === STEP_STATUS.succeeded;
      await prisma.runStep.updateMany({
        where: { runId, name: step },
        data: {
          status: outcome.status,
          origin: STEP_ORIGIN.fresh,
          attemptCount: outcome.attemptCount,
          errorCode: succeeded ? null : (outcome.errorCode ?? null),
          errorMessage: succeeded ? null : (outcome.errorMessage ?? null),
          modelId: outcome.modelId ?? null,
          inputTokens: outcome.inputTokens ?? null,
          outputTokens: outcome.outputTokens ?? null,
          costUsd: outcome.costUsd ?? null,
          durationMs: outcome.durationMs ?? null,
          finishedAt: now,
        },
      });
    },

    async awaitApproval(runId, now) {
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: RUN_STATUS.pendingApproval,
          workerState: 'queued',
          workerId: null,
          heartbeat: now,
        },
      });
    },

    async failRun(runId, now) {
      await prisma.run.update({
        where: { id: runId },
        data: { status: RUN_STATUS.failed, workerId: null, finishedAt: now },
      });
    },
  };
}

/**
 * 잡은 실행에 단계 6줄이 없으면 만든다. 첫 실행은 전부 `pending`+`fresh`이고,
 * 재실행(이전 Run이 있는 주제)은 범위 밖 앞 단계를 `carried`로 이어받아야 하는데, 그건
 * **BE14c**가 `planRerun` + `resolveCarriedSources`로 채운다. 지금은 첫 실행만 돈다.
 */
async function ensureSteps(prisma: PrismaClient, runId: string): Promise<void> {
  const existing = await prisma.runStep.count({ where: { runId } });
  if (existing > 0) return;

  await prisma.runStep.createMany({
    data: STEP_ORDER.map((name, order) => ({ runId, name, order })),
  });
}

async function toClaimedRun(
  prisma: PrismaClient,
  run: { id: string; topicId: string; topicTitle: string; topicSlug: string; modelId: string },
): Promise<ClaimedRun> {
  const rows = await prisma.runStep.findMany({
    where: { runId: run.id },
    orderBy: { order: 'asc' },
    select: { name: true, status: true, origin: true },
  });

  return {
    id: run.id,
    topicId: run.topicId,
    topicTitle: run.topicTitle,
    topicSlug: run.topicSlug,
    modelId: run.modelId,
    steps: rows.flatMap((row) =>
      isStepName(row.name)
        ? [
            {
              name: row.name,
              // 모르는 값이면 대기로 본다 — 단계는 원자적이라 다시 돌아도 안전하다.
              status: isStepStatus(row.status) ? row.status : STEP_STATUS.pending,
              origin: row.origin === STEP_ORIGIN.carried ? STEP_ORIGIN.carried : STEP_ORIGIN.fresh,
            },
          ]
        : [],
    ),
  };
}
