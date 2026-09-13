// 실행 화면 URL(?tab=·?pending=·?q=·?id=) 해석. 탭·필터는 URL에만 둔다(로컬 상태 금지).
import type { RunListFilter } from '@galley/pipeline';

export type RunTab = RunListFilter['tab'];

export interface RunView {
  filter: RunListFilter;
  selectedId: string | undefined;
}

type SearchParamValue = string | string[] | undefined;

const DEFAULT_TAB: RunTab = 'active';

function first(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseTab(value: SearchParamValue): RunTab {
  return first(value) === 'done' ? 'done' : DEFAULT_TAB;
}

/** 없거나 모르는 값은 진행 중 탭. pending은 "1"만 켠다. */
export function parseRunView(params: {
  tab?: SearchParamValue;
  pending?: SearchParamValue;
  q?: SearchParamValue;
  id?: SearchParamValue;
}): RunView {
  const tab = parseTab(params.tab);
  const pendingOnly = first(params.pending) === '1';
  const query = first(params.q)?.trim() || undefined;
  const selectedId = first(params.id)?.trim() || undefined;

  return {
    filter: {
      tab,
      ...(pendingOnly ? { pendingOnly: true } : {}),
      ...(query ? { query } : {}),
    },
    selectedId,
  };
}

export function runsHref(input: {
  tab?: RunTab;
  pendingOnly?: boolean;
  query?: string;
  selectedId?: string;
}): string {
  const params = new URLSearchParams({ tab: input.tab ?? DEFAULT_TAB });
  if (input.pendingOnly) params.set('pending', '1');
  const query = input.query?.trim();
  if (query) params.set('q', query);
  const selectedId = input.selectedId?.trim();
  if (selectedId) params.set('id', selectedId);
  return `/runs?${params.toString()}`;
}
