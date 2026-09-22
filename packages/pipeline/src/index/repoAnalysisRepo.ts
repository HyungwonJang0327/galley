// RepoAnalysis 저장 — JSON 컬럼(keywords·pointers)을 쓰는 **유일한 자리**. 헬퍼(schema.ts)를 거치지 않고는 저장할 수 없다.
// (repoId, key) upsert로 id를 유지해 증분 재인덱싱에도 TopicAnalysisLink가 살아남는다.
import type { PrismaClient } from '@prisma/client';
import { serializePointers, serializeStringArray, type PointersFailure } from './schema.ts';
import type { AreaAnalysisDraft } from './areaAnalysis.ts';
import type { ChangeAnalysisDraft } from './changeAnalysis.ts';
import type { OverviewAnalysisDraft } from './overviewAnalysis.ts';

export type AnalysisDraft = AreaAnalysisDraft | ChangeAnalysisDraft | OverviewAnalysisDraft;

export type UpsertAnalysisResult = { ok: true; id: string; created: boolean } | PointersFailure;

export async function upsertRepoAnalysis(
  prisma: PrismaClient,
  repoId: string,
  draft: AnalysisDraft,
): Promise<UpsertAnalysisResult> {
  const pointers = serializePointers(draft.pointers);
  if (!pointers.ok) return pointers;
  const data = {
    kind: draft.kind,
    title: draft.title,
    summary: draft.summary,
    keywords: serializeStringArray(draft.keywords),
    pointers: pointers.text,
    period: draft.period,
    summaryOnly: draft.summaryOnly,
    filtered: draft.filtered,
    redacted: draft.redacted,
    modelId: draft.modelId,
    inputTokens: draft.usage.inputTokens,
    outputTokens: draft.usage.outputTokens,
    costUsd: draft.costUsd,
  };
  const existing = await prisma.repoAnalysis.findUnique({
    where: { repoId_key: { repoId, key: draft.key } },
    select: { id: true },
  });
  const row = await prisma.repoAnalysis.upsert({
    where: { repoId_key: { repoId, key: draft.key } },
    update: data,
    create: { repoId, key: draft.key, ...data },
    select: { id: true },
  });
  return { ok: true, id: row.id, created: existing === null };
}
