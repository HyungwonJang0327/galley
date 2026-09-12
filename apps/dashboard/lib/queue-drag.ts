// 드래그로 놓은 결과 → 순서 변경 입력(순수). DnD 라이브러리·DOM 없이 계산만 하므로 테스트할 수 있다.
// 대기 탭만 사용(사용자 결정 2026-09-12) — 후보는 ### 소제목 때문에 pipeline이 거부한다.
import type { QueueStatus, ReorderQueueTopicInput } from '@galley/pipeline';

/** 놓은 위치: 대상 행의 위쪽인지 아래쪽인지. */
export type DropEdge = 'top' | 'bottom';

export interface DropTarget {
  /** 끌고 온 행의 현재 위치(0기반, 섹션 기준). */
  from: number;
  /** 놓인 대상 행의 위치(0기반, 섹션 기준). */
  over: number;
  edge: DropEdge;
}

/**
 * 놓인 자리를 "최종 위치(to)"로 바꾼다. 제자리면 null(액션을 부르지 않는다).
 * 위쪽에 놓으면 대상 앞, 아래쪽에 놓으면 대상 뒤. 아래로 끌 때는 자기 자신이 빠지는 것을 반영한다.
 */
export function dropToIndex({ from, over, edge }: DropTarget): number | null {
  if (from === over) return null;

  const insertAt = edge === 'top' ? over : over + 1;
  const to = insertAt > from ? insertAt - 1 : insertAt;
  return to === from ? null : to;
}

export interface DropContext {
  status: QueueStatus;
  /** 끌린 행(드래그를 시작한 행). 제목은 반드시 이쪽 것이어야 한다. */
  source: { index: number; title: string };
  /** 놓인 대상 행. */
  over: { index: number };
  edge: DropEdge;
}

/**
 * 드롭 결과를 서버 액션 입력으로 만든다. 제자리면 null(부르지 않는다).
 * title은 **끌린 행**의 제목이다 — 대상 행 제목을 보내면 서버가 위치·제목 불일치로 거부한다.
 */
export function buildReorderInput({
  status,
  source,
  over,
  edge,
}: DropContext): ReorderQueueTopicInput | null {
  const to = dropToIndex({ from: source.index, over: over.index, edge });
  if (to === null) return null;
  return { status, from: source.index, to, title: source.title };
}
