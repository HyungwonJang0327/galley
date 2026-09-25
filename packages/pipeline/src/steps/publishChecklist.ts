// 발행 체크리스트 — 사람이 발행하면서 손으로 할 일(자동화 비목표: 벨로그 시리즈 등록 API 없음, decisions/series.md).
// 값은 영어 id와 표시에 끼울 값만 — 한국어 문구는 대시보드 라벨 매핑이 붙인다(decisions/db-value-language.md). 화면은 Phase 2.
import type { SeriesStepInfo } from './series.ts';

/**
 * id별로 문구에 끼울 값이 묶인 판별 유니온 — 대시보드 라벨 매핑이 `params.seriesName` 같은 키를 잘못 쓰면 typecheck가
 * 잡는다(BX4 리뷰 L3). id를 더하면 여기에 항을 더한다.
 */
export type PublishChecklistItem =
  /** 벨로그에서 이 글을 시리즈에 추가한다. */
  | { id: 'velog-series-add'; params: { seriesName: string } }
  /** 본문 인용 줄의 이전 편 링크 자리표시자([벨로그 링크])를 실제 URL로 채운다. */
  | { id: 'velog-previous-link'; params: { previousTitle: string } };

export type PublishChecklistId = PublishChecklistItem['id'];

/**
 * 시리즈 편의 체크리스트 — 시리즈가 아니면 빈 배열. 이전 편 링크 항목은 자리표시자가 실제로 들어갔을 때만(이전 편이 있고
 * 그 완료 줄에 벨로그 URL이 아직 없을 때).
 */
export function seriesChecklist(info: SeriesStepInfo | undefined): PublishChecklistItem[] {
  if (info === undefined) return [];
  const items: PublishChecklistItem[] = [
    { id: 'velog-series-add', params: { seriesName: info.name } },
  ];
  if (info.previous !== undefined && info.previous.url === undefined)
    items.push({ id: 'velog-previous-link', params: { previousTitle: info.previous.title } });
  return items;
}
