import { TimelineItem, TimelineItems } from '@galley/ui';
import { STEP_OPTIONS, stepTimeline } from '../../../lib/run-labels';
import type { RunStepView } from '../../../lib/run-detail';

const time = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR') : null);
const seconds = (ms: number | null) => (ms === null ? null : `${Math.round(ms / 1000)}초`);
const tokens = (step: RunStepView) =>
  step.inputTokens === null || step.outputTokens === null
    ? null
    : `${(step.inputTokens + step.outputTokens).toLocaleString('ko-KR')} 토큰`;

function metaOf(step: RunStepView | undefined, carried: boolean): string {
  if (!step || step.status === 'pending') return '대기';
  // 출처 단계의 시각을 못 찾으면(출처 Run 삭제 등) "이전 결과"만 — 꼬리 구분자를 남기지 않는다.
  if (carried) return ['이전 결과', time(step.sourceFinishedAt)].filter(Boolean).join(' · ');
  if (step.status === 'running') return '진행 중';
  if (step.status === 'failed') {
    // 사람이 읽는 건 errorMessage다(decisions/error-handling.md 단계 실패 기록). 코드는 없을 때 폴백.
    const reason = step.errorMessage ?? step.errorCode;
    return [reason, `${step.attemptCount}회 시도`].filter(Boolean).join(' · ');
  }
  return [seconds(step.durationMs), tokens(step)].filter(Boolean).join(' · ');
}

export function RunTimeline({ steps }: { steps: RunStepView[] }) {
  const byName = new Map(steps.map((s) => [s.name, s]));
  return (
    <TimelineItems>
      {STEP_OPTIONS.map(({ name, label }, idx) => {
        const step = byName.get(name);
        const line = stepTimeline(step ?? { status: 'pending', origin: 'fresh' });
        return (
          <TimelineItem
            key={name}
            status={line.status}
            statusLabel={line.statusLabel}
            title={label}
            meta={metaOf(step, line.carried)}
            isLast={idx === STEP_OPTIONS.length - 1}
          />
        );
      })}
    </TimelineItems>
  );
}
