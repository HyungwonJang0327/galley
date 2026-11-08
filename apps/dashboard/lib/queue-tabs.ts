// 큐 화면 탭(?tab=)·카테고리 필터(?category=) 해석. 탭 4개 = 주제_큐.md 섹션 4개
// (decisions/layout.md §4). 활성 탭·필터는 URL에만 둔다(로컬 상태 금지).
import type { QueueStatus } from '@galley/pipeline';

export type QueueTabId = 'waiting' | 'candidates' | 'hold' | 'done';

export interface QueueTab {
  id: QueueTabId;
  /** DB 저장값(영어, decisions/db-value-language.md). */
  status: QueueStatus;
  /** 표시 한국어 — 탭 이름·상태 배지·적재 요약 문구. 파일 섹션 머리글과 같다. */
  label: string;
  /** 탭 옆 개수 표시(대기·후보만 — layout.md §4). */
  showCount: boolean;
}

type SearchParamValue = string | string[] | undefined;

const WAITING: QueueTab = { id: 'waiting', status: 'waiting', label: '대기', showCount: true };

export const QUEUE_TABS: readonly QueueTab[] = [
  WAITING,
  { id: 'candidates', status: 'candidate', label: '후보', showCount: true },
  { id: 'hold', status: 'hold', label: '보류', showCount: false },
  { id: 'done', status: 'done', label: '완료', showCount: false },
];

/** 상태 → 표시 한국어(탭 정의와 같은 소스). */
export function queueStatusLabel(status: QueueStatus): string {
  return QUEUE_TABS.find((tab) => tab.status === status)?.label ?? status;
}

function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** 없거나 모르는 값이면 대기 탭. */
export function parseQueueTab(value: SearchParamValue): QueueTab {
  const id = first(value);
  return QUEUE_TABS.find((tab) => tab.id === id) ?? WAITING;
}

export function parseCategory(value: SearchParamValue): string | undefined {
  const category = first(value)?.trim();
  return category ? category : undefined;
}

/** 필터 선택지. 처음 나온 순서(= 파일 순서)대로 중복 없이. */
export function listCategories(topics: readonly { category: string | null }[]): string[] {
  const seen = new Set<string>();
  for (const { category } of topics) {
    if (category) seen.add(category);
  }
  return [...seen];
}

/** 목록에 없는 카테고리(낡은 URL)는 필터 없음으로 본다. */
export function filterByCategory<T extends { category: string | null }>(
  topics: readonly T[],
  category: string | undefined,
): T[] {
  if (!category || !topics.some((topic) => topic.category === category)) return [...topics];
  return topics.filter((topic) => topic.category === category);
}

export function queueHref(tab: QueueTabId, category?: string): string {
  const params = new URLSearchParams({ tab });
  if (category) params.set('category', category);
  return `/queue?${params.toString()}`;
}
