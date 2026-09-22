// 리포 인덱서 1 — 파일 트리 요약 + 디렉터리(area)별 분석 글. 워커의 IndexJob 실행(BE5)이 이 함수를 부른다.
// 읽기: git(읽기 명령만) · 모델: ModelAdapter 하나 · 쓰기: RepoAnalysis(저장 함수 한 곳). **Repo 상태·headSha는 쓰지 않는다** —
// 성공·실패 모두 IndexJob 실행자(BE5)가 한 곳에서 기록한다(IndexJob failed ↔ Repo error). 이 함수는 headSha를 report로 돌려준다.
// report에는 경로·디렉터리 이름을 넣지 않는다(수치만) — IndexJob·로그로 흘러가도 회사 디렉터리명이 새지 않게.
import type { PrismaClient } from '@prisma/client';
import type { ModelAdapter, ModelUsage } from '../model/ModelAdapter.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import { analyzeArea } from './areaAnalysis.ts';
import type { AreaFileContent } from './areaAnalysis.ts';
import { gitHead, gitListFiles, gitShowFile, looksBinary } from './gitRead.ts';
import type { GitFailure } from './gitRead.ts';
import { planExecution, type ExecutionOptions } from './batchControl.ts';
import { INDEX_LIMITS, type IndexLimits } from './limits.ts';
import { upsertRepoAnalysis } from './repoAnalysisRepo.ts';
import { areaKeyForPath, planAreas } from './tree.ts';

export interface AreaProgress {
  key: string;
  status: 'saved' | 'skipped';
  analysisId?: string;
  usage: ModelUsage;
  costUsd: number;
  done: number;
  total: number;
}

export interface IndexAreasInput {
  repo: { id: string; name: string; path: string; readOnly: boolean };
  adapter: ModelAdapter;
  /** null = 설정 없음. readOnly 리포에서는 거부한다(회사 리포는 필터 없이 요약을 저장하지 않는다). */
  redactConfig: RedactConfig | null;
  /** 이 커밋 기준으로 읽는다(실행자가 작업의 toSha를 넘긴다 — 틱 사이에 HEAD가 움직여도 작업 전체가 한 커밋 기준). 없으면 HEAD. */
  commit?: string;
  limits?: IndexLimits;
  /** 재개: 이미 끝난 영역 키. 이 영역은 모델을 부르지 않고 건너뛴다. */
  skipKeys?: readonly string[];
  /** 재개: 이 키까지(포함) 끝났다고 보고 그 다음부터(IndexJob.progressCursor). */
  resumeAfterKey?: string;
  /** 이번 호출에서 돌릴 최대 영역 수(실행자가 틱마다 하나씩). */
  maxBatches?: number;
  /** 증분: 이 경로들이 속한 영역만 다시 만든다(`gitDiffPaths`). 나머지는 unchanged. 없으면 전체. */
  changedPaths?: readonly string[];
  /** 영역 하나가 끝날 때마다 — 진행 저장(progressCursor)·로그용. 던지지 않는 것으로 가정한다. */
  onAreaDone?: (progress: AreaProgress) => Promise<void> | void;
}

export interface IndexAreasReport {
  headSha: string;
  totalFiles: number;
  ignoredFiles: number;
  /** 계획된 영역 수(skipKeys로 건너뛴 것 포함). */
  planned: number;
  /** 저장한 영역 수. */
  saved: number;
  summaryOnly: number;
  /** 모델이 유효한 답을 주지 못해 건너뛴 영역 수. 실패가 아니라 기록이다(키는 onAreaDone으로만 — report에는 경로가 없다). */
  skipped: number;
  /** skipKeys·resumeAfterKey로 이번에 돌리지 않은 영역 수. */
  resumedPast: number;
  /** 증분에서 바뀐 경로가 없어 두는 영역 수. */
  unchanged: number;
  /** maxBatches에 걸려 이번에 못 돈 영역 수. */
  remaining: number;
  /** 본문을 읽지 못한(또는 바이너리로 제외한) 파일 수. */
  unreadableFiles: number;
  usage: ModelUsage;
  costUsd: number;
}

export type IndexAreasFailure =
  | { ok: false; code: 'REDACT_CONFIG_REQUIRED' }
  | GitFailure
  | { ok: false; code: 'MODEL_FAILED'; errorName: string; partial: IndexAreasReport }
  | { ok: false; code: 'POINTERS_EMPTY' | 'POINTER_INVALID'; partial: IndexAreasReport };
/** plannedKeys: 계획된 영역 키 전부(돌렸든 아니든) — 실행자가 사라진 영역의 고아 행을 지우는 기준. report에는 넣지 않는다. */
export type IndexAreasResult =
  { ok: true; report: IndexAreasReport; plannedKeys: string[] } | IndexAreasFailure;

export async function indexRepoAreas(
  prisma: PrismaClient,
  input: IndexAreasInput,
): Promise<IndexAreasResult> {
  const { repo, adapter } = input;
  if (repo.readOnly && input.redactConfig === null)
    return { ok: false, code: 'REDACT_CONFIG_REQUIRED' };
  const limits = input.limits ?? INDEX_LIMITS;

  const head =
    input.commit !== undefined
      ? { ok: true as const, value: input.commit }
      : await gitHead(repo.path);
  if (!head.ok) return head;
  const files = await gitListFiles(repo.path, head.value);
  if (!files.ok) return files;

  const summary = planAreas(files.value, limits);
  const plannedKeys = summary.areas.map((a) => a.key);
  let unchangedKeys: Set<string> | undefined;
  if (input.changedPaths !== undefined) {
    const touched = new Set<string>();
    for (const path of input.changedPaths) {
      const key = areaKeyForPath(summary.areas, path);
      if (key !== undefined) touched.add(key);
    }
    unchangedKeys = new Set(plannedKeys.filter((k) => !touched.has(k)));
  }
  const execution = planExecution(plannedKeys, {
    ...(input.skipKeys !== undefined ? { skipKeys: input.skipKeys } : {}),
    ...(input.resumeAfterKey !== undefined ? { resumeAfterKey: input.resumeAfterKey } : {}),
    ...(unchangedKeys !== undefined ? { unchangedKeys } : {}),
    ...(input.maxBatches !== undefined ? { maxBatches: input.maxBatches } : {}),
  } satisfies ExecutionOptions);
  const toRun = new Set(execution.toRun);
  const report: IndexAreasReport = {
    headSha: head.value,
    totalFiles: summary.totalFiles,
    ignoredFiles: summary.ignoredFiles,
    planned: summary.areas.length,
    saved: 0,
    summaryOnly: 0,
    skipped: 0,
    resumedPast: execution.resumedPast,
    unchanged: execution.unchanged,
    remaining: execution.remaining,
    unreadableFiles: 0,
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
  };
  const addUsage = (usage: ModelUsage, costUsd: number) => {
    report.usage.inputTokens += usage.inputTokens;
    report.usage.outputTokens += usage.outputTokens;
    report.costUsd += costUsd;
  };

  for (const [i, plan] of summary.areas.entries()) {
    if (!toRun.has(plan.key)) continue;
    const contents: AreaFileContent[] = [];
    for (const f of plan.files) {
      if (!f.include) continue;
      const shown = await gitShowFile(repo.path, head.value, f.path);
      if (shown.ok && !looksBinary(shown.value)) contents.push({ path: f.path, text: shown.value });
      else report.unreadableFiles += 1;
    }
    const analyzed = await analyzeArea(adapter, {
      repoName: repo.name,
      commit: head.value,
      plan,
      contents,
      redactConfig: input.redactConfig,
    });
    if (!analyzed.ok) {
      if (analyzed.code === 'MODEL_FAILED')
        return { ok: false, code: 'MODEL_FAILED', errorName: analyzed.errorName, partial: report };
      addUsage(analyzed.usage, analyzed.costUsd);
      report.skipped += 1;
      await input.onAreaDone?.({
        key: plan.key,
        status: 'skipped',
        usage: analyzed.usage,
        costUsd: analyzed.costUsd,
        done: i + 1,
        total: summary.areas.length,
      });
      continue;
    }
    const saved = await upsertRepoAnalysis(prisma, repo.id, analyzed.draft);
    if (!saved.ok) return { ok: false, code: saved.code, partial: report };
    addUsage(analyzed.draft.usage, analyzed.draft.costUsd);
    report.saved += 1;
    if (analyzed.draft.summaryOnly) report.summaryOnly += 1;
    await input.onAreaDone?.({
      key: plan.key,
      status: 'saved',
      analysisId: saved.id,
      usage: analyzed.draft.usage,
      costUsd: analyzed.draft.costUsd,
      done: i + 1,
      total: summary.areas.length,
    });
  }

  return { ok: true, report, plannedKeys };
}
