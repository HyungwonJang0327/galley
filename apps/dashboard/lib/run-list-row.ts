// 실행 목록(2분할 좌측) 한 행의 표시값(서버 전용). decisions/layout.md "실행 /runs":
// 6단계 원형 진행 인디케이터 · 주제명 · 마지막 단계 미리보기 · 시간 · 상태 배지 옆 "근거 없음 n"(BE13).
import 'server-only';
import type { TimelineStatus } from 'galley-ui';
import type { RunListRow } from './run-list';
import type { VerificationFlags } from './run-artifacts';
import { STEP_OPTIONS, stepTimeline } from './run-labels';

export interface RunStepDot {
  /** 파이프라인 순서 그대로. */
  name: string;
  status: TimelineStatus;
  /** 접근성용 "단계명 상태" 한 줄. */
  label: string;
}

export interface RunListRowView {
  /** 파이프라인 순서 6칸. DB에 행이 없는 단계는 pending. */
  dots: RunStepDot[];
  /** 마지막으로 손댄 단계(pending이 아닌 마지막 단계)의 "단계명 상태". 전부 대기면 "대기". */
  lastStep: string;
  /** 종결됐으면 종결 시각, 아니면 시작 시각. */
  time: string;
}

const SHORT_DATE_TIME = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "9. 14. 16:41" — 목록 행에 맞는 짧은 형식. */
export function formatShortDateTime(iso: string): string {
  return SHORT_DATE_TIME.format(new Date(iso));
}

export function runListRowView(row: RunListRow): RunListRowView {
  const byName = new Map(row.steps.map((s) => [s.name, s]));
  const dots = STEP_OPTIONS.map(({ name, label }) => {
    const step = byName.get(name);
    const line = stepTimeline(step ?? { status: 'pending', origin: 'fresh' });
    return { name, status: line.status, label: `${label} ${line.statusLabel}` };
  });
  const touched = dots.filter((d) => d.status !== 'pending');
  const lastStep = touched.length === 0 ? '대기' : touched[touched.length - 1]!.label;
  return { dots, lastStep, time: formatShortDateTime(row.finishedAt ?? row.startedAt) };
}

/** 상태 배지 옆 작은 텍스트 — 근거 없는 주장이 있을 때만("근거 없음 n"). 불확실만 있으면 조용히(타임라인 배지가 보여 준다). */
export function evidenceFlagText(flags: VerificationFlags | undefined): string | undefined {
  return flags !== undefined && flags.unsupported > 0
    ? `근거 없음 ${flags.unsupported}`
    : undefined;
}
