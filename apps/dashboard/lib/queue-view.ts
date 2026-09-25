// 큐 화면 모델: 섹션 데이터 + URL 쿼리 → 탭(개수·활성)·필터 선택지·행. page.tsx는 이 결과만
// 그린다(Server Component는 렌더 테스트하지 않음 — decisions/dashboard-testing.md).
import type { QueueEntry, QueueSections, QueueSeriesSummary } from '@galley/pipeline';
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

/** 행 제목 앞 시리즈 배지(태그는 제목 텍스트에 섞지 않는다 — decisions/series.md). */
export interface QueueRowSeriesView {
  /** 배지 글자 `A-1`. */
  label: string;
  /** 툴팁 `시리즈명 · N/M편`. 정의 줄이 없는 태그면 없음(이름을 지어내지 않는다). */
  tooltip: string | undefined;
  /** `(기존 글)` 편 — 실행 대상이 아니다. */
  alreadyPublished: boolean;
}

export interface QueueRowView {
  /** QueueItem.id — 실행 시작·실행 상세 연결 키. */
  id: string;
  title: string;
  /** 보조 텍스트: 완료 탭은 완료일, 나머지는 카테고리. */
  meta: string | undefined;
  /** 섹션 안에서의 0기반 위치(카테고리 필터 전 기준). 행 ⋮ 이동이 파일에서 항목을 찾는 키. */
  index: number;
  series: QueueRowSeriesView | undefined;
}

/** 후보 탭의 시리즈 정의 줄 — 그룹 헤더. 편이 후보를 떠나도 정의 줄은 남는다(decisions/series.md). */
export interface QueueGroupView {
  key: string;
  name: string;
  /** 후보에 편이 없을 때 안내(`편 없음 · 대기 N편`). 편이 있으면 없음. */
  hint: string | undefined;
  /** 정의 줄 자리(후보 섹션 인덱스) — 같은 키 정의가 둘이어도 React key가 겹치지 않게. */
  position: number;
}

export type QueueListItem =
  { kind: 'row'; row: QueueRowView } | { kind: 'group'; group: QueueGroupView };

export interface QueueView {
  tabs: QueueTabView[];
  active: QueueTab;
  /** 카테고리 필터 선택지(후보 탭에서만). */
  categories: string[];
  /** 적용 중인 카테고리(선택지에 있을 때만). */
  category: string | undefined;
  rows: QueueRowView[];
  /** rows에 그룹 헤더(후보 탭의 시리즈 정의 줄)를 끼운 순서. 대기 탭(DnD)은 rows를 그대로 쓴다. */
  items: QueueListItem[];
}

export function buildQueueView(
  sections: QueueSections,
  params: { tab?: SearchParamValue; category?: SearchParamValue },
  series: readonly QueueSeriesSummary[] = [],
): QueueView {
  const active = parseQueueTab(params.tab);
  const topics = sections[active.status];
  const categories = active.id === 'candidates' ? listCategories(topics) : [];
  const requested = parseCategory(params.category);
  const category =
    requested !== undefined && categories.includes(requested) ? requested : undefined;

  const byKey = new Map(series.map((s) => [s.key, s]));
  const rows = filterByCategory(
    topics.map((topic, index) => ({ ...topic, index })),
    category,
  ).map((topic) => ({
    id: topic.id,
    title: topic.title,
    meta: rowMeta(active, topic),
    index: topic.index,
    series: rowSeries(topic, byKey),
  }));

  return {
    tabs: QUEUE_TABS.map((tab) => ({
      ...tab,
      count: tab.showCount ? sections[tab.status].length : undefined,
      isActive: tab.id === active.id,
    })),
    active,
    categories,
    category,
    rows,
    items: active.id === 'candidates' ? interleaveGroups(rows, series, category) : rowItems(rows),
  };
}

function rowMeta(tab: QueueTab, topic: QueueEntry): string | undefined {
  const meta = tab.id === 'done' ? topic.completedOn : topic.category;
  return meta ?? undefined;
}

function rowSeries(
  topic: QueueEntry,
  byKey: ReadonlyMap<string, QueueSeriesSummary>,
): QueueRowSeriesView | undefined {
  if (topic.series === null) return undefined;
  const def = byKey.get(topic.series.key);
  return {
    label: `${topic.series.key}-${topic.series.episode}`,
    tooltip: def === undefined ? undefined : seriesTooltip(def, topic.series.episode),
    alreadyPublished: topic.series.alreadyPublished,
  };
}

/** `시리즈명 · N/M편` — M은 파일에 있는 편 수(번호가 비연속이면 `5/3편`도 그대로, decisions/series.md). */
function seriesTooltip(def: QueueSeriesSummary, episode: number): string {
  return `${def.name} · ${episode}/${def.episodeCount}편`;
}

function rowItems(rows: readonly QueueRowView[]): QueueListItem[] {
  return rows.map((row) => ({ kind: 'row', row }));
}

/**
 * 정의 줄 자리(position = 정의 줄 바로 뒤 후보 항목의 섹션 인덱스)에 그룹 헤더를 끼운다. 카테고리 필터가 있으면 그
 * 소제목의 정의 줄만. 편이 없는 정의 줄은 다음 항목 앞(또는 맨 끝)에 온다.
 */
function interleaveGroups(
  rows: readonly QueueRowView[],
  series: readonly QueueSeriesSummary[],
  category: string | undefined,
): QueueListItem[] {
  const pending = series
    .filter((s) => category === undefined || s.category === category)
    .map((s) => ({ kind: 'group' as const, group: groupView(s), position: s.position }));
  const items: QueueListItem[] = [];
  let next = 0;
  for (const row of rows) {
    for (let head = pending[next]; head !== undefined && head.position <= row.index;) {
      items.push({ kind: 'group', group: head.group });
      next += 1;
      head = pending[next];
    }
    items.push({ kind: 'row', row });
  }
  for (const rest of pending.slice(next)) items.push({ kind: 'group', group: rest.group });
  return items;
}

function groupView(def: QueueSeriesSummary): QueueGroupView {
  const waiting = def.byStatus.대기;
  const hint =
    def.byStatus.후보 > 0 ? undefined : waiting > 0 ? `편 없음 · 대기 ${waiting}편` : '편 없음';
  return { key: def.key, name: def.name, hint, position: def.position };
}
