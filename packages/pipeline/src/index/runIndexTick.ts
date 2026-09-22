// IndexJob 실행 틱 — Run 워커(runOnce)와 같은 모양: **한 틱 = 배치 하나**(영역 하나·변경 묶음 하나·개요). 틱 사이에 Run이
// 끼어들 수 있고(Run 우선 — decisions/run-location.md), 종료 신호는 배치 사이에서 반환하며, 진행은 배치마다 저장돼
// 재기동이 커서 다음부터 이어 돈다. 단계: 영역(area) → 변경(change) → 개요(overview) → 끝(Repo ready·headSha).
// 인덱서는 RepoAnalysis만 쓰고, IndexJob·Repo 상태는 indexJobRepo 한 곳에서 쓴다.
import type { PrismaClient } from '@prisma/client';
import type { ModelAdapter, ModelUsage } from '../model/ModelAdapter.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import type { Clock, Logger, Timers } from '../worker/WorkerDeps.ts';
import { gitDiffPaths, gitHead } from './gitRead.ts';
import {
  beatIndexJob,
  claimIndexJob,
  finishIndexJob,
  markRepoIndexing,
  recordIndexProgress,
  releaseIndexJob,
  reclaimStaleIndexJobs,
  type ClaimedIndexJob,
} from './indexJobRepo.ts';
import { indexRepoAreas } from './indexRepoAreas.ts';
import { indexRepoChanges } from './indexRepoChanges.ts';
import { indexRepoOverview } from './indexRepoOverview.ts';
import type { IndexLimits } from './limits.ts';
import { pruneAnalyses } from './repoAnalysisRepo.ts';
import { ANALYSIS_KIND, INDEX_JOB_KIND } from './schema.ts';

/** Run 워커와 같은 값(decisions/run-location.md). */
export const INDEX_HEARTBEAT_TIMEOUT_MS = 30_000;
export const INDEX_HEARTBEAT_INTERVAL_MS = 5_000;

export interface IndexTickDeps {
  prisma: PrismaClient;
  workerId: string;
  clock: Clock;
  timers: Timers;
  logger: Logger;
  /** 레지스트리 조회(모델 id → 어댑터). 없으면 작업 실패(INDEX_MODEL_UNKNOWN). */
  adapters: { get(id: string): ModelAdapter | undefined };
  /** null = 설정 없음(readOnly 리포는 인덱서가 REDACT_CONFIG_REQUIRED로 거부한다). */
  redactConfig: RedactConfig | null;
  limits?: IndexLimits;
}

export type IndexTickOutcome =
  | 'idle'
  | 'claimed'
  /** 배치 하나를 처리했거나 단계를 넘겼다. */
  | 'progressed'
  | 'completed'
  | 'failed'
  | 'recovered'
  | 'released';

export interface IndexTickResult {
  outcome: IndexTickOutcome;
  jobId?: string;
}

/** 커서 형식(인덱서 소유): `<단계>:<마지막으로 끝낸 키>` — 키가 비면 그 단계의 처음. */
type Phase = 'areas' | 'changes' | 'overview';
const PHASES: readonly Phase[] = ['areas', 'changes', 'overview'];
const isPhase = (v: string): v is Phase => (PHASES as readonly string[]).includes(v);

export function parseCursor(cursor: string | null): { phase: Phase; afterKey?: string } {
  if (cursor === null) return { phase: 'areas' };
  const colon = cursor.indexOf(':');
  const phase = colon === -1 ? cursor : cursor.slice(0, colon);
  const key = colon === -1 ? '' : cursor.slice(colon + 1);
  if (!isPhase(phase)) return { phase: 'areas' };
  return key === '' ? { phase } : { phase, afterKey: key };
}
export const formatCursor = (phase: Phase, afterKey = ''): string => `${phase}:${afterKey}`;

export async function runIndexTick(
  deps: IndexTickDeps,
  signal?: AbortSignal,
): Promise<IndexTickResult> {
  if (signal?.aborted) return { outcome: 'idle' };
  const { prisma } = deps;
  const now = deps.clock.now();

  const reclaimed = await reclaimStaleIndexJobs(
    prisma,
    new Date(now.getTime() - INDEX_HEARTBEAT_TIMEOUT_MS),
  );
  if (reclaimed > 0) {
    deps.logger.info('끊긴 인덱싱 작업을 회수했다', { count: reclaimed });
    return { outcome: 'recovered' };
  }

  const claimed = await claimIndexJob(prisma, deps.workerId, now);
  if (claimed === null) return { outcome: 'idle' };
  const { job } = claimed;
  if (claimed.justClaimed) {
    await markRepoIndexing(prisma, job.repo.id);
    deps.logger.info('인덱싱 작업을 잡았다', { jobId: job.id, workerId: deps.workerId });
    return { outcome: 'claimed', jobId: job.id };
  }

  const stopHeartbeat = deps.timers.every(INDEX_HEARTBEAT_INTERVAL_MS, () => {
    beatIndexJob(prisma, job.id, deps.clock.now()).catch((error: unknown) => {
      deps.logger.error('인덱싱 heartbeat 쓰기 실패', {
        jobId: job.id,
        detail: error instanceof Error ? error.message : String(error),
      });
    });
  });
  try {
    return await runBatch(deps, job, signal);
  } catch (error) {
    // 예상 밖의 예외(프로그래머 오류·Prisma) — 작업은 실패로, 리포는 error로. 스택은 로그에만.
    deps.logger.error('인덱싱 틱 실패', {
      jobId: job.id,
      detail: error instanceof Error ? error.stack : String(error),
    });
    await finishIndexJob(
      prisma,
      { id: job.id, repoId: job.repo.id, modelId: job.modelId },
      {
        ok: false,
        code: 'INDEX_UNEXPECTED',
        message: error instanceof Error ? error.name : 'UnknownError',
      },
      null,
      deps.clock.now(),
    );
    return { outcome: 'failed', jobId: job.id };
  } finally {
    stopHeartbeat();
  }
}

async function runBatch(
  deps: IndexTickDeps,
  job: ClaimedIndexJob,
  signal?: AbortSignal,
): Promise<IndexTickResult> {
  const { prisma } = deps;
  const ref = { jobId: job.id };
  const fail = async (code: string, message?: string): Promise<IndexTickResult> => {
    deps.logger.error('인덱싱 작업 실패', { ...ref, code });
    await finishIndexJob(
      prisma,
      { id: job.id, repoId: job.repo.id, modelId: job.modelId },
      { ok: false, code, ...(message !== undefined ? { message } : {}) },
      null,
      deps.clock.now(),
    );
    return { outcome: 'failed', jobId: job.id };
  };

  const adapter = deps.adapters.get(job.modelId);
  if (adapter === undefined) return fail('INDEX_MODEL_UNKNOWN');
  const incremental = job.kind === INDEX_JOB_KIND.incremental && job.fromSha !== null;
  const { phase, afterKey } = parseCursor(job.progressCursor);
  const common = {
    repo: job.repo,
    adapter,
    redactConfig: deps.redactConfig,
    ...(deps.limits !== undefined ? { limits: deps.limits } : {}),
  };

  let processedKey: string | undefined;
  let usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
  let costUsd = 0;
  let remaining = 0;
  let nextPhase: Phase | 'done' = phase;

  if (phase === 'areas') {
    let changedPaths: string[] | undefined;
    if (incremental) {
      const head = await gitHead(job.repo.path);
      if (!head.ok) return fail(head.code);
      const diff = await gitDiffPaths(job.repo.path, job.fromSha!, head.value);
      if (!diff.ok) return fail(diff.code);
      changedPaths = diff.value;
    }
    const r = await indexRepoAreas(prisma, {
      ...common,
      maxBatches: 1,
      ...(afterKey !== undefined ? { resumeAfterKey: afterKey } : {}),
      ...(changedPaths !== undefined ? { changedPaths } : {}),
      onAreaDone: (p) => {
        processedKey = p.key;
        usage = p.usage;
        costUsd = p.costUsd;
      },
    });
    if (!r.ok) return fail(r.code, 'errorName' in r ? r.errorName : undefined);
    remaining = r.report.remaining;
    if (remaining === 0) {
      const pruned = await pruneAnalyses(prisma, job.repo.id, ANALYSIS_KIND.area, r.plannedKeys);
      if (pruned > 0) deps.logger.info('사라진 영역의 분석 글을 지웠다', { ...ref, count: pruned });
      nextPhase = 'changes';
    }
  } else if (phase === 'changes') {
    const r = await indexRepoChanges(prisma, {
      ...common,
      maxBatches: 1,
      ...(afterKey !== undefined ? { resumeAfterKey: afterKey } : {}),
      ...(incremental ? { sinceSha: job.fromSha! } : {}),
      onBatchDone: (p) => {
        processedKey = p.key;
        usage = p.usage;
        costUsd = p.costUsd;
      },
    });
    if (!r.ok) return fail(r.code, 'errorName' in r ? r.errorName : undefined);
    remaining = r.report.remaining;
    if (remaining === 0) {
      const pruned = await pruneAnalyses(prisma, job.repo.id, ANALYSIS_KIND.change, r.plannedKeys);
      if (pruned > 0)
        deps.logger.info('옛 변경 묶음의 분석 글을 지웠다', { ...ref, count: pruned });
      nextPhase = 'overview';
    }
  } else {
    const r = await indexRepoOverview(prisma, common);
    if (!r.ok && r.code !== 'NO_SOURCES')
      return fail(r.code, 'errorName' in r ? r.errorName : undefined);
    if (r.ok) {
      usage = r.report.usage;
      costUsd = r.report.costUsd;
    } else deps.logger.info('분석 글이 없어 개요를 만들지 않았다', ref);
    processedKey = 'overview';
    nextPhase = 'done';
  }

  const now = deps.clock.now();
  const done = job.progressDone + (processedKey !== undefined ? 1 : 0);
  const cursor =
    nextPhase === phase
      ? formatCursor(phase, processedKey ?? afterKey)
      : formatCursor(nextPhase === 'done' ? 'overview' : nextPhase);
  await recordIndexProgress(
    prisma,
    job.id,
    { cursor, done, total: done + remaining + (nextPhase === 'done' ? 0 : 1), usage, costUsd },
    now,
  );

  if (nextPhase === 'done') {
    const head = await gitHead(job.repo.path);
    await finishIndexJob(
      prisma,
      { id: job.id, repoId: job.repo.id, modelId: job.modelId },
      { ok: true },
      head.ok ? head.value : null,
      now,
    );
    deps.logger.info('인덱싱 작업 완료', { ...ref, batches: done });
    return { outcome: 'completed', jobId: job.id };
  }
  if (signal?.aborted) {
    await releaseIndexJob(prisma, job.id, now);
    deps.logger.info('종료 신호로 인덱싱 작업을 반환했다', ref);
    return { outcome: 'released', jobId: job.id };
  }
  return { outcome: 'progressed', jobId: job.id };
}
