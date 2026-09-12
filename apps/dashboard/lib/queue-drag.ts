// 드래그로 놓은 결과 → 순서 변경 입력(순수). DnD 라이브러리·DOM 없이 계산만 하므로 테스트할 수 있다.
// 대기 탭만 사용(사용자 결정 2026-09-12) — 후보는 ### 소제목 때문에 pipeline이 거부한다.

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
