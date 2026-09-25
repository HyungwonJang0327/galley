// 큐 행 ⋮ 메뉴 항목(표현용, 순수). 클라이언트에서도 쓰므로 pipeline 값은 import하지 않는다(타입만).
// 항목 구성은 decisions/layout.md §4 — 이동 3개 중 현재 섹션은 빼고, 구분선 뒤 "지금 실행".
import type { MovableStatus, QueueStatus } from '@galley/pipeline';

export interface QueueRowMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}

export type QueueRowMenuEntry = QueueRowMenuItem | { type: 'separator' };

const MOVE_TARGETS: readonly { status: MovableStatus; label: string }[] = [
  { status: '대기', label: '대기로' },
  { status: '후보', label: '후보로' },
  { status: '보류', label: '보류로' },
];

const MOVE_PREFIX = 'move:';
export const RUN_NOW_ID = 'run-now';

/** 실행 화면(BM6·B1e) 전이라 "지금 실행"은 비활성. 가짜로 동작시키지 않는다. */
const RUN_NOW: QueueRowMenuItem = {
  id: RUN_NOW_ID,
  label: '지금 실행',
  disabled: true,
  disabledReason: '실행 화면은 아직 준비 중입니다.',
};

/** `(기존 글)` 편 — 이미 발행돼 실행 대상이 아니다(decisions/series.md). 실행 버튼이 생겨도 같은 판정을 쓴다. */
export const ALREADY_PUBLISHED_REASON = '이미 발행된 글입니다.';

export interface QueueRowMenuOptions {
  /** 시리즈 `(기존 글)` 편 — 준비 중 사유보다 앞선다(준비가 끝나도 실행 불가). */
  alreadyPublished?: boolean;
}

export function queueRowMenuEntries(
  status: QueueStatus,
  options: QueueRowMenuOptions = {},
): QueueRowMenuEntry[] {
  const moves = MOVE_TARGETS.filter((target) => target.status !== status).map((target) => ({
    id: `${MOVE_PREFIX}${target.status}`,
    label: target.label,
  }));
  const runNow = options.alreadyPublished
    ? { ...RUN_NOW, disabledReason: ALREADY_PUBLISHED_REASON }
    : RUN_NOW;
  return [...moves, { type: 'separator' }, runNow];
}

/** 메뉴 id → 옮길 섹션. 이동 항목이 아니면 null. */
export function parseMoveTarget(id: string): MovableStatus | null {
  if (!id.startsWith(MOVE_PREFIX)) return null;
  const status = id.slice(MOVE_PREFIX.length);
  return MOVE_TARGETS.some((target) => target.status === status) ? (status as MovableStatus) : null;
}
