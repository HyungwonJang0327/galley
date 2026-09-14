// 실행 화면(2분할) 분기 — 어느 행을 자동 선택하고, 우측에 무엇을 그리는가.
// page.tsx(서버 컴포넌트)는 렌더 테스트가 어려워 판단만 여기로 뺀다. 타입만 쓰므로 server-only 아님.
import type { RunDetailResult, RunDetailView } from './run-detail';

/** ?id=가 없으면 목록 첫 행. 목록이 비면 없음. */
export function pickActiveId(
  lists: readonly { id: string }[],
  selectedId: string | undefined,
): string | undefined {
  return selectedId ?? lists[0]?.id;
}

export type RunPaneState =
  | { kind: 'selected'; run: RunDetailView }
  | { kind: 'failed'; message: string }
  | { kind: 'empty' };

/**
 * 우측 영역. 없는 id(RUN_NOT_FOUND)는 실패가 아니라 "선택된 실행 없음"으로 — 옛 링크·삭제된
 * 실행에서 화면이 죽지 않는다. 조회 자체가 실패(RUN_DETAIL_FAILED)했을 때만 alert.
 */
export function resolveRunPane(detail: RunDetailResult | undefined): RunPaneState {
  if (detail === undefined) return { kind: 'empty' };
  if (detail.ok) return { kind: 'selected', run: detail.data };
  if (detail.error.code === 'RUN_DETAIL_FAILED') {
    return { kind: 'failed', message: detail.error.message };
  }
  return { kind: 'empty' };
}
