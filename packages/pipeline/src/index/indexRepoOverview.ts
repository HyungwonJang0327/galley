// 리포 인덱서 3 — 저장된 area·change 분석 글을 종합해 overview 한 편을 만든다. 워커의 IndexJob 실행(BE5)이 마지막에 부른다.
// 읽기: RepoAnalysis(DB) · 모델: ModelAdapter 하나 · 쓰기: RepoAnalysis(저장 함수 한 곳, key `overview` upsert).
// git은 만지지 않는다. Repo 상태·IndexJob은 쓰지 않는다(실행자 몫).
import type { PrismaClient } from '@prisma/client';
import type { ModelAdapter, ModelUsage } from '../model/ModelAdapter.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import type { IndexLimits } from './limits.ts';
import { analyzeOverview, type OverviewSource } from './overviewAnalysis.ts';
import { upsertRepoAnalysis } from './repoAnalysisRepo.ts';
import { ANALYSIS_KIND, parsePointers, parseStringArray } from './schema.ts';

export interface IndexOverviewInput {
  repo: { id: string; name: string; readOnly: boolean };
  adapter: ModelAdapter;
  redactConfig: RedactConfig | null;
  limits?: IndexLimits;
}

export interface IndexOverviewReport {
  /** 입력으로 읽은 area·change 글 수. */
  sources: number;
  /** 저장했으면 id. 모델 출력이 깨져 건너뛰었으면 없음. */
  analysisId?: string;
  summaryOnly: boolean;
  usage: ModelUsage;
  costUsd: number;
}

export type IndexOverviewFailure =
  | { ok: false; code: 'REDACT_CONFIG_REQUIRED' }
  /** area·change 글이 하나도 없다 — 개요를 만들 재료가 없다(인덱서 1·2가 먼저다). */
  | { ok: false; code: 'NO_SOURCES' }
  | { ok: false; code: 'MODEL_FAILED'; errorName: string }
  | { ok: false; code: 'POINTERS_EMPTY' | 'POINTER_INVALID' };
export type IndexOverviewResult = { ok: true; report: IndexOverviewReport } | IndexOverviewFailure;

export async function indexRepoOverview(
  prisma: PrismaClient,
  input: IndexOverviewInput,
): Promise<IndexOverviewResult> {
  const { repo, adapter } = input;
  if (repo.readOnly && input.redactConfig === null)
    return { ok: false, code: 'REDACT_CONFIG_REQUIRED' };

  const rows = await prisma.repoAnalysis.findMany({
    where: { repoId: repo.id, kind: { in: [ANALYSIS_KIND.area, ANALYSIS_KIND.change] } },
    select: {
      key: true,
      kind: true,
      title: true,
      summary: true,
      keywords: true,
      period: true,
      pointers: true,
    },
    orderBy: { key: 'asc' },
  });
  const sources: OverviewSource[] = rows.map((r) => ({
    key: r.key,
    kind: r.kind === ANALYSIS_KIND.area ? 'area' : 'change',
    title: r.title,
    summary: r.summary,
    keywords: parseStringArray(r.keywords),
    period: r.period,
    pointers: parsePointers(r.pointers),
  }));
  if (sources.length === 0) return { ok: false, code: 'NO_SOURCES' };

  const analyzed = await analyzeOverview(adapter, {
    repoName: repo.name,
    sources,
    redactConfig: input.redactConfig,
    ...(input.limits !== undefined ? { limits: input.limits } : {}),
  });
  if (!analyzed.ok) {
    if (analyzed.code === 'MODEL_FAILED')
      return { ok: false, code: 'MODEL_FAILED', errorName: analyzed.errorName };
    return {
      ok: true,
      report: {
        sources: sources.length,
        summaryOnly: false,
        usage: analyzed.usage,
        costUsd: analyzed.costUsd,
      },
    };
  }
  const saved = await upsertRepoAnalysis(prisma, repo.id, analyzed.draft);
  if (!saved.ok) return { ok: false, code: saved.code };
  return {
    ok: true,
    report: {
      sources: sources.length,
      analysisId: saved.id,
      summaryOnly: analyzed.draft.summaryOnly,
      usage: analyzed.draft.usage,
      costUsd: analyzed.draft.costUsd,
    },
  };
}
