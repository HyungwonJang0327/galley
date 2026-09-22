// 리포 인덱서 2 — 커밋 이력을 기간(월)·주 디렉터리로 묶어 change 분석 글을 만든다. 워커의 IndexJob 실행(BE5)이 area 다음에
// 부른다. 읽기: git log(읽기만) · 모델: ModelAdapter 하나 · 쓰기: RepoAnalysis(저장 함수 한 곳). indexRepoAreas와 같은 규칙 —
// Repo 상태·IndexJob은 쓰지 않고(실행자 몫) report는 수치만(경로·기간 키는 콜백으로만 — 결정 ⑨).
// 증분(fromSha) 주의: 묶음 키는 입력 커밋 수에 따라 분할이 달라지므로, 같은 달을 일부만 다시 읽으면 기존 글을 덮어쓰거나
// 중복이 생긴다. 증분 실행자(BE5)는 "새 커밋이 닿은 달 전체"를 다시 읽고 그 달의 기존 change 행을 지운 뒤 저장한다.
import type { PrismaClient } from '@prisma/client';
import type { ModelAdapter, ModelUsage } from '../model/ModelAdapter.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import { analyzeChange } from './changeAnalysis.ts';
import { planChangeBatches } from './changes.ts';
import { gitHead, gitLog } from './gitRead.ts';
import type { GitFailure } from './gitRead.ts';
import { INDEX_LIMITS, type IndexLimits } from './limits.ts';
import { upsertRepoAnalysis } from './repoAnalysisRepo.ts';

export interface ChangeProgress {
  key: string;
  status: 'saved' | 'skipped';
  analysisId?: string;
  usage: ModelUsage;
  costUsd: number;
  done: number;
  total: number;
}

export interface IndexChangesInput {
  repo: { id: string; name: string; path: string; readOnly: boolean };
  adapter: ModelAdapter;
  redactConfig: RedactConfig | null;
  limits?: IndexLimits;
  /** 증분: 이 커밋 다음부터(제외). 없으면 처음부터(maxCommits 안). */
  fromSha?: string;
  skipKeys?: readonly string[];
  onBatchDone?: (progress: ChangeProgress) => Promise<void> | void;
}

export interface IndexChangesReport {
  headSha: string;
  /** 읽은 커밋 수(병합 제외, maxCommits 안). */
  totalCommits: number;
  /** maxCommits에 걸려 더 오래된 커밋을 읽지 않았으면 true. */
  truncated: boolean;
  emptyCommits: number;
  ignoredCommits: number;
  planned: number;
  saved: number;
  summaryOnly: number;
  /** 모델이 유효한 답을 주지 못해 건너뛴 묶음 수(키는 onBatchDone으로만). */
  skipped: number;
  resumedPast: number;
  usage: ModelUsage;
  costUsd: number;
}

export type IndexChangesFailure =
  | { ok: false; code: 'REDACT_CONFIG_REQUIRED' }
  | GitFailure
  | { ok: false; code: 'MODEL_FAILED'; errorName: string; partial: IndexChangesReport }
  | { ok: false; code: 'POINTERS_EMPTY' | 'POINTER_INVALID'; partial: IndexChangesReport };
export type IndexChangesResult = { ok: true; report: IndexChangesReport } | IndexChangesFailure;

export async function indexRepoChanges(
  prisma: PrismaClient,
  input: IndexChangesInput,
): Promise<IndexChangesResult> {
  const { repo, adapter } = input;
  if (repo.readOnly && input.redactConfig === null)
    return { ok: false, code: 'REDACT_CONFIG_REQUIRED' };
  const limits = input.limits ?? INDEX_LIMITS;
  const skip = new Set(input.skipKeys ?? []);

  const head = await gitHead(repo.path);
  if (!head.ok) return head;
  const log = await gitLog(repo.path, {
    to: head.value,
    ...(input.fromSha !== undefined ? { from: input.fromSha } : {}),
    maxCommits: limits.maxCommits,
  });
  if (!log.ok) return log;

  const plan = planChangeBatches(log.value.commits, limits);
  const report: IndexChangesReport = {
    headSha: head.value,
    totalCommits: plan.totalCommits,
    truncated: log.value.truncated,
    emptyCommits: plan.emptyCommits,
    ignoredCommits: plan.ignoredCommits,
    planned: plan.batches.length,
    saved: 0,
    summaryOnly: 0,
    skipped: 0,
    resumedPast: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
  };
  const addUsage = (usage: ModelUsage, costUsd: number) => {
    report.usage.inputTokens += usage.inputTokens;
    report.usage.outputTokens += usage.outputTokens;
    report.costUsd += costUsd;
  };

  for (const [i, batch] of plan.batches.entries()) {
    if (skip.has(batch.key)) {
      report.resumedPast += 1;
      continue;
    }
    const analyzed = await analyzeChange(adapter, {
      repoName: repo.name,
      batch,
      redactConfig: input.redactConfig,
      limits,
    });
    if (!analyzed.ok) {
      if (analyzed.code === 'MODEL_FAILED')
        return { ok: false, code: 'MODEL_FAILED', errorName: analyzed.errorName, partial: report };
      addUsage(analyzed.usage, analyzed.costUsd);
      report.skipped += 1;
      await input.onBatchDone?.({
        key: batch.key,
        status: 'skipped',
        usage: analyzed.usage,
        costUsd: analyzed.costUsd,
        done: i + 1,
        total: plan.batches.length,
      });
      continue;
    }
    const saved = await upsertRepoAnalysis(prisma, repo.id, analyzed.draft);
    if (!saved.ok) return { ok: false, code: saved.code, partial: report };
    addUsage(analyzed.draft.usage, analyzed.draft.costUsd);
    report.saved += 1;
    if (analyzed.draft.summaryOnly) report.summaryOnly += 1;
    await input.onBatchDone?.({
      key: batch.key,
      status: 'saved',
      analysisId: saved.id,
      usage: analyzed.draft.usage,
      costUsd: analyzed.draft.costUsd,
      done: i + 1,
      total: plan.batches.length,
    });
  }
  return { ok: true, report };
}
