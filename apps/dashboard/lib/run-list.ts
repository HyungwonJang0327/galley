// 실행 목록(2분할 화면 좌측) 데이터(서버 전용). 필터 해석(URL → RunListFilter)은 화면이 하고,
// 여기서는 조회·직렬화·실패 봉투만 — decisions/error-handling.md ②.
import { listRuns, prisma, type RunListFilter, type RunListItem } from '@galley/pipeline';
import type { RunRecord } from './run-commands';

export interface RunListRow extends RunRecord {
  /** 파이프라인 순서 6행(진행 인디케이터·마지막 단계 미리보기용). */
  steps: { name: string; status: string; origin: string }[];
}

export type RunListResult =
  | { ok: true; data: RunListRow[] }
  | { ok: false; error: { code: 'RUN_LIST_FAILED'; message: string } };

function toRow(item: RunListItem): RunListRow {
  return {
    id: item.id,
    topicId: item.topicId,
    attempt: item.attempt,
    topicSlug: item.topicSlug,
    topicTitle: item.topicTitle,
    status: item.status,
    modelId: item.modelId,
    startedAt: item.startedAt.toISOString(),
    finishedAt: item.finishedAt === null ? null : item.finishedAt.toISOString(),
    steps: item.steps.map((s) => ({ name: s.name, status: s.status, origin: s.origin })),
  };
}

export async function getRunList(filter: RunListFilter): Promise<RunListResult> {
  try {
    const items = await listRuns(prisma, filter);
    return { ok: true, data: items.map(toRow) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'RUN_LIST_FAILED', message: `실행 목록을 불러오지 못했습니다: ${reason}` },
    };
  }
}
