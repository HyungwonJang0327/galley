// 실행·단계 상태(DB 영어 값) → 화면 한국어 라벨·Badge variant·TimelineStatus.
// 어휘는 pipeline 상태 머신이 소유하고, 여기서는 표시만 붙인다(decisions/db-value-language.md).
// ui는 variant·status 이름만 알고 "승인 대기"를 모른다(decisions/ui-package-boundary.md).
import 'server-only';
import type { BadgeProps, TimelineStatus } from '@galley/ui';
import {
  isRunStatus,
  isStepName,
  isStepStatus,
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  type RunStatus,
  type StepName,
  type StepStatus,
} from '@galley/pipeline';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

// ── 검수 상태 ────────────────────────────────────────────────────────────────

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: '실행 중',
  pendingApproval: '승인 대기',
  done: '완료',
  failed: '실패',
  // 승인 대기에서 수정 지시를 받아 다음 시도로 넘어간 실행(종결). "완료"와 구분해야
  // 몇 번 만에 승인됐는지 보인다.
  revised: '수정 지시',
};

// decisions/layout.md §5: 진행 블루 / 승인 대기 주황 / 완료 초록 / 실패 빨강 / 종결된 옛 시도 회색
const RUN_STATUS_VARIANT: Record<RunStatus, BadgeVariant> = {
  running: 'info',
  pendingApproval: 'warning',
  done: 'success',
  failed: 'danger',
  revised: 'neutral',
};

export interface RunStatusBadge {
  label: string;
  variant: BadgeVariant;
  /** 실행 중만 펄스 점. */
  pulse: boolean;
}

/** 모르는 값(스키마엔 enum이 없다)은 값 그대로 회색으로 — 화면이 죽지 않는다. */
export function runStatusBadge(status: string): RunStatusBadge {
  if (!isRunStatus(status)) return { label: status, variant: 'neutral', pulse: false };
  return {
    label: RUN_STATUS_LABEL[status],
    variant: RUN_STATUS_VARIANT[status],
    pulse: status === RUN_STATUS.running,
  };
}

/** 워커가 아직 단계를 돌리는 중인가 — 2s 폴링은 이 값이 true일 때만(decisions/core-modules.md). */
export function isRunInProgress(status: string): boolean {
  return status === RUN_STATUS.running;
}

// ── 단계 ─────────────────────────────────────────────────────────────────────

const STEP_LABEL: Record<StepName, string> = {
  evidence: '근거 수집',
  velog: '벨로그 본문',
  verify: '근거 검증',
  linkedin: '링크드인',
  zenn: 'Zenn',
  publishInfo: '발행정보·썸네일',
};

/** 파이프라인 순서 그대로의 (이름, 라벨) — Select 항목·빈 타임라인 뼈대용. */
export const STEP_OPTIONS: readonly { name: StepName; label: string }[] = STEP_ORDER.map(
  (name) => ({ name, label: STEP_LABEL[name] }),
);

export function stepLabel(name: string): string {
  return isStepName(name) ? STEP_LABEL[name] : name;
}

const STEP_TIMELINE: Record<StepStatus, TimelineStatus> = {
  pending: 'pending',
  running: 'active',
  succeeded: 'done',
  failed: 'failed',
};

const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: '대기',
  running: '진행 중',
  succeeded: '완료',
  failed: '실패',
};

export interface StepTimeline {
  status: TimelineStatus;
  /** 마커 접근성 이름. carried는 "이전 결과" — "건너뜀" 문구는 쓰지 않는다(evidence-collection). */
  statusLabel: string;
  /** 이전 실행 결과를 이어받은 행. 화면은 "이전 결과 · {시각}" 보조 텍스트를 붙인다. */
  carried: boolean;
}

export function stepTimeline(step: { status: string; origin: string }): StepTimeline {
  const carried = step.origin === STEP_ORIGIN.carried;
  if (!isStepStatus(step.status)) {
    return { status: 'pending', statusLabel: step.status, carried };
  }
  return {
    status: STEP_TIMELINE[step.status],
    statusLabel:
      carried && step.status === 'succeeded' ? '이전 결과' : STEP_STATUS_LABEL[step.status],
    carried,
  };
}
