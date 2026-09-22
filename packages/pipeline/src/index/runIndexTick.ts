// IndexJob 실행 틱 — Run 워커(runOnce)와 같은 모양: **한 틱 = 배치 하나**(영역 하나·변경 묶음 하나·개요). 틱 사이에 Run이
// 끼어들 수 있고(Run 우선 — decisions/run-location.md), 종료 신호는 배치 사이에서 반환하며, 진행은 배치마다 저장돼
// 재기동이 커서 다음부터 이어 돈다. 단계: 영역(area) → 변경(change) → 개요(overview) → 끝(Repo ready·headSha).
// 인덱서는 RepoAnalysis만 쓰고, IndexJob·Repo 상태는 indexJobRepo 한 곳에서 쓴다. 예상 밖 예외는 `INDEX_TICK_FAILED`(<동작>_FAILED).
import type { PrismaClient } from '@prisma/client';
import type { ModelAdapter, ModelUsage } from '../model/ModelAdapter.ts';
import type { RedactConfig } from '../evidence/redact.ts';
// heartbeat 간격·만료는 Run 워커와 같은 값 한 곳(decisions/run-location.md).
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS } from '../worker/runOnce.ts';
import type { Clock, Logger, Timers } from '../worker/WorkerDeps.ts';
import { gitDiffPaths, gitHead } from './gitRead.ts';
import {
  beatIndexJob,
  claimIndexJob,
  finishIndexJob,
  markRepoIndexing,
  pinIndexJobCommit,
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
  | 'released'
  /** 배치를 도는 사이에 회수돼 다른 워커의 것이 됐다 — 이 워커의 결과는 버린다(새 워커가 같은 배치를 다시 돈다). */
  | 'lost';

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
    new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS),
  );
  if (reclaimed > 0) {
    deps.logger.info('끊긴 인덱싱 작업을 회수했다', { count: reclaimed });
    return { outcome: 'recovered' };
  }

  const claimed = await claimIndexJob(prisma, deps.workerId, now);
  if (claimed === null) return { outcome: 'idle' };
  const { job } = claimed;
  if (claimed.justClaimed) {
    // 기준 커밋 고정 — enqueue가 채운 toSha가 없으면(옛 작업·직접 만든 행) 지금 HEAD로.
    if (job.toSha === null) {
      const head = await gitHead(job.repo.path);
      if (!head.ok) {
        deps.logger.error('인덱싱 작업 실패', { jobId: job.id, code: head.code });
        await finishIndexJob(prisma, owner(deps, job), { ok: false, code: head.code }, now);
        return { outcome: 'failed', jobId: job.id };
      }
      await pinIndexJobCommit(prisma, job.id, head.value);
      job.toSha = head.value;
    }
    await markRepoIndexing(prisma, job.repo.id);
    deps.logger.info('인덱싱 작업을 잡았다', { jobId: job.id, workerId: deps.workerId });
    return { outcome: 'claimed', jobId: job.id };
  }

  const stopHeartbeat = deps.timers.every(HEARTBEAT_INTERVAL_MS, () => {
    beatIndexJob(prisma, { id: job.id, workerId: deps.workerId }, deps.clock.now()).catch(
      (error: unknown) => {
        deps.logger.error('인덱싱 heartbeat 쓰기 실패', {
          jobId: job.id,
          detail: error instanceof Error ? error.message : String(error),
        });
      },
    );
  });
  try {
    return await runBatch(deps, job, signal);
  } catch (error) {
    // 예상 밖의 예외(프로그래머 오류·Prisma) — 작업은 실패로, 리포는 error로. 스택은 로그에만.
    deps.logger.error('인덱싱 틱 실패', {
      jobId: job.id,
      detail: error instanceof Error ? error.stack : String(error),
    });
    const recorded = await finishIndexJob(
      prisma,
      owner(deps, job),
      {
        ok: false,
        code: 'INDEX_TICK_FAILED',
        message: error instanceof Error ? error.name : 'UnknownError',
      },
      deps.clock.now(),
    );
    return { outcome: recorded ? 'failed' : 'lost', jobId: job.id };
  } finally {
    stopHeartbeat();
  }
}

const owner = (deps: IndexTickDeps, job: ClaimedIndexJob) => ({
  id: job.id,
  workerId: deps.workerId,
  repoId: job.repo.id,
  modelId: job.modelId,
  toSha: job.toSha,
});

const lost = (deps: IndexTickDeps, jobId: string): IndexTickResult => {
  deps.logger.info('인덱싱 작업이 회수돼 다른 워커의 것이 됐다 — 이 배치의 결과는 버린다', {
    jobId,
  });
  return { outcome: 'lost', jobId };
};

async function runBatch(
  deps: IndexTickDeps,
  job: ClaimedIndexJob,
  signal?: AbortSignal,
): Promise<IndexTickResult> {
  const { prisma } = deps;
  const ref = { jobId: job.id };
  const fail = async (
    code: string,
    message?: string,
    partial?: { usage: ModelUsage; costUsd: number },
  ): Promise<IndexTickResult> => {
    // 실패 직전까지의 과금도 남긴다(MODEL_FAILED 전에 끝난 배치들).
    if (partial !== undefined && (partial.usage.inputTokens > 0 || partial.costUsd > 0))
      await recordIndexProgress(prisma, owner(deps, job), partial, deps.clock.now());
    const recorded = await finishIndexJob(
      prisma,
      owner(deps, job),
      { ok: false, code, ...(message !== undefined ? { message } : {}) },
      deps.clock.now(),
    );
    if (!recorded) return lost(deps, job.id);
    deps.logger.error('인덱싱 작업 실패', { ...ref, code });
    return { outcome: 'failed', jobId: job.id };
  };
  // 클레임 틱이 고정해 둔 기준 커밋. 없으면(클레임 뒤 행이 바뀐 경우) 프로그래머 오류다.
  if (job.toSha === null) return fail('INDEX_COMMIT_MISSING');
  const commit = job.toSha;

  const adapter = deps.adapters.get(job.modelId);
  if (adapter === undefined) return fail('INDEX_MODEL_UNKNOWN');
  const incremental = job.kind === INDEX_JOB_KIND.incremental && job.fromSha !== null;
  const { phase, afterKey } = parseCursor(job.progressCursor);
  const common = {
    repo: job.repo,
    adapter,
    redactConfig: deps.redactConfig,
    commit,
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
      const diff = await gitDiffPaths(job.repo.path, job.fromSha!, commit);
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
    if (!r.ok)
      return fail(
        r.code,
        'errorName' in r ? r.errorName : undefined,
        'partial' in r ? r.partial : undefined,
      );
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
    if (!r.ok)
      return fail(
        r.code,
        'errorName' in r ? r.errorName : undefined,
        'partial' in r ? r.partial : undefined,
      );
    remaining = r.report.remaining;
    if (remaining === 0) {
      const pruned = await pruneAnalyses(prisma, job.repo.id, ANALYSIS_KIND.change, r.plannedKeys);
      if (pruned > 0)
        deps.logger.info('옛 변경 묶음의 분석 글을 지웠다', { ...ref, count: pruned });
      nextPhase = 'overview';
    }
  } else {
    const { commit: _c, ...overviewInput } = common;
    void _c;
    const r = await indexRepoOverview(prisma, overviewInput);
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
  const recorded = await recordIndexProgress(
    prisma,
    owner(deps, job),
    { cursor, done, total: done + remaining + (nextPhase === 'done' ? 0 : 1), usage, costUsd },
    now,
  );
  if (!recorded) return lost(deps, job.id);

  if (nextPhase === 'done') {
    const finished = await finishIndexJob(prisma, owner(deps, job), { ok: true }, now);
    if (!finished) return lost(deps, job.id);
    deps.logger.info('인덱싱 작업 완료', { ...ref, batches: done });
    return { outcome: 'completed', jobId: job.id };
  }
  if (signal?.aborted) {
    await releaseIndexJob(prisma, owner(deps, job), now);
    deps.logger.info('종료 신호로 인덱싱 작업을 반환했다', ref);
    return { outcome: 'released', jobId: job.id };
  }
  return { outcome: 'progressed', jobId: job.id };
}
