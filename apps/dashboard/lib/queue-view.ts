// 큐 화면 모델: 섹션 데이터 + URL 쿼리 → 탭(개수·활성)·필터 선택지·행. page.tsx는 이 결과만
// 그린다(Server Component는 렌더 테스트하지 않음 — decisions/dashboard-testing.md).
import type { QueueEntry, QueueSections } from '@galley/pipeline';
import {
  QUEUE_TABS,
  filterByCategory,
  listCategories,
  parseCategory,
  parseQueueTab,
  type QueueTab,
} from './queue-tabs';

type SearchParamValue = string | string[] | undefined;

export interface QueueTabView extends QueueTab {
  /** 섹션 전체 개수(필터 무관). 대기·후보만. */
  count: number | undefined;
  isActive: boolean;
}

export interface QueueRowView {
  title: string;
  /** 보조 텍스트: 완료 탭은 완료일, 나머지는 카테고리. */
  meta: string | undefined;
  /** 섹션 안에서의 0기반 위치(카테고리 필터 전 기준). 행 ⋮ 이동이 파일에서 항목을 찾는 키. */
  index: number;
}

export interface QueueView {
  tabs: QueueTabView[];
  active: QueueTab;
  /** 카테고리 필터 선택지(후보 탭에서만). */
  categories: string[];
  /** 적용 중인 카테고리(선택지에 있을 때만). */
  category: string | undefined;
  rows: QueueRowView[];
}

export function buildQueueView(
  sections: QueueSections,
  params: { tab?: SearchParamValue; category?: SearchParamValue },
): QueueView {
  const active = parseQueueTab(params.tab);
  const topics = sections[active.status];
  const categories = active.id === 'candidates' ? listCategories(topics) : [];
  const requested = parseCategory(params.category);
  const category =
    requested !== undefined && categories.includes(requested) ? requested : undefined;

  return {
    tabs: QUEUE_TABS.map((tab) => ({
      ...tab,
      count: tab.showCount ? sections[tab.status].length : undefined,
      isActive: tab.id === active.id,
    })),
    active,
    categories,
    category,
    rows: filterByCategory(
      topics.map((topic, index) => ({ ...topic, index })),
      category,
    ).map((topic) => ({
      title: topic.title,
      meta: rowMeta(active, topic),
      index: topic.index,
    })),
  };
}

function rowMeta(tab: QueueTab, topic: QueueEntry): string | undefined {
  const meta = tab.id === 'done' ? topic.completedOn : topic.category;
  return meta ?? undefined;
}
