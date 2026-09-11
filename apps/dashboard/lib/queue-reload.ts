// 큐 수동 갱신(큐 화면 헤더 버튼): 주제_큐.md를 DB에 다시 적재하고 섹션별 개수를 알린다.
// 화면을 열 때 하는 자동 적재(getQueueSections)와 같은 경로 — decisions/queue-sync-direction.md.
import type { QueueSections } from '@galley/pipeline';
import { getQueueSections, type QueueLoadResult } from './queue-data';
import { QUEUE_TABS } from './queue-tabs';

export type QueueReloadResult =
  { ok: true; data: { summary: string } } | Extract<QueueLoadResult, { ok: false }>;

/** 탭 순서(= 파일 섹션 순서)대로 섹션별 개수. */
export function queueReloadSummary(sections: QueueSections): string {
  const counts = QUEUE_TABS.map(({ status }) => `${status} ${sections[status].length}`);
  return `주제_큐.md 기준으로 맞췄습니다: ${counts.join(' · ')}`;
}

export async function reloadQueue(): Promise<QueueReloadResult> {
  const result = await getQueueSections();
  if (!result.ok) return result;
  return { ok: true, data: { summary: queueReloadSummary(result.data) } };
}
