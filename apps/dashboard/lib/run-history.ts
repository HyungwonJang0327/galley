// 실행 이력(/runs/history) 표의 행 데이터(서버 전용). 조회·직렬화·표시값까지 여기서 — 표 컴포넌트(클라)는
// 정렬만 한다(decisions/table-component.md: 로직은 앱, Table은 표현만). 실패는 봉투로(decisions/error-handling.md ②).
import 'server-only';
import { listRunHistory, prisma, STEP_ORIGIN, type RunHistoryItem } from '@galley/pipeline';
import { createModelLabeler, formatCostUsd } from './model-label';
import { runStatusBadge, STEP_OPTIONS, stepTimeline, type RunStatusBadge } from './run-labels';
import { formatShortDateTime } from './run-list-row';
import { runsHref } from './run-view';

/** 최신 N건까지. Pagination은 자리가 생기면(todo P7d-apply 메모). */
export const RUN_HISTORY_LIMIT = 200;

export interface RunHistoryRow {
  id: string;
  /** 실행 상세(2분할) 링크 — 종결 여부에 맞는 탭으로. */
  href: string;
  title: string;
  /** 1이면 표시하지 않는다. */
  attempt: number;
  badge: RunStatusBadge;
  /** 마지막으로 손댄 단계 "단계명 상태". 전부 대기면 "대기". */
  lastStep: string;
  /** 완료(succeeded)된 단계 수 / 전체 단계 수. */
  doneCount: number;
  stepCount: number;
  /** 모델 label(레지스트리에 없는 id는 id 그대로). */
  model: string;
  /** 정렬 키(ISO)와 표시값. */
  startedAt: string;
  startedAtText: string;
  /** 이번 시도가 실제로 돈(fresh) 단계의 소요 합(ms). 기록이 없으면 null → "—". */
  durationMs: number | null;
  durationText: string;
  /** fresh 단계의 입력+출력 토큰 합. 기록이 없으면 null → "—". */
  tokens: number | null;
  tokensText: string;
  /** fresh 단계의 비용 합(USD). 기록이 없으면 null → "—". */
  costUsd: number | null;
  costText: string;
}

export type RunHistoryResult =
  | { ok: true; data: RunHistoryRow[] }
  | { ok: false; error: { code: 'RUN_HISTORY_FAILED'; message: string } };

const EMPTY = '—';

/** "1.2초" · "45초" · "3분 12초" · "1시간 5분". 0은 "0초". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}초`;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  if (m > 0) return s > 0 ? `${m}분 ${s}초` : `${m}분`;
  return `${s}초`;
}

/** 1,234 — 천 단위 구분. */
export function formatTokens(tokens: number): string {
  return tokens.toLocaleString('ko-KR');
}

/** 값이 하나도 없으면 null(기록 없음과 0을 구분한다 — 0은 "0"으로 보여야 한다). */
function sumOrNull(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : present.reduce((a, b) => a + b, 0);
}

export function runHistoryRow(
  item: RunHistoryItem,
  modelLabel: (modelId: string) => string,
): RunHistoryRow {
  const byName = new Map(item.steps.map((s) => [s.name, s]));
  const lines = STEP_OPTIONS.map(({ name, label }) => {
    const step = byName.get(name);
    const line = stepTimeline(step ?? { status: 'pending', origin: 'fresh' });
    return { label: `${label} ${line.statusLabel}`, status: line.status };
  });
  const touched = lines.filter((l) => l.status !== 'pending');
  // 이번 시도에서 실제로 모델을 부른 단계만 — carried는 이전 시도의 사용량이라 여기 더하면 중복이다.
  const fresh = item.steps.filter((s) => s.origin === STEP_ORIGIN.fresh);
  const durationMs = sumOrNull(fresh.map((s) => s.durationMs));
  const tokens = sumOrNull(
    fresh.map((s) =>
      s.inputTokens === null && s.outputTokens === null
        ? null
        : (s.inputTokens ?? 0) + (s.outputTokens ?? 0),
    ),
  );
  const costUsd = sumOrNull(fresh.map((s) => s.costUsd));
  return {
    id: item.id,
    href: runsHref({ tab: item.finishedAt === null ? 'active' : 'done', selectedId: item.id }),
    title: item.topicTitle,
    attempt: item.attempt,
    badge: runStatusBadge(item.status),
    lastStep: touched.length === 0 ? '대기' : touched[touched.length - 1]!.label,
    doneCount: lines.filter((l) => l.status === 'done').length,
    stepCount: lines.length,
    model: modelLabel(item.modelId),
    startedAt: item.startedAt.toISOString(),
    startedAtText: formatShortDateTime(item.startedAt.toISOString()),
    durationMs,
    durationText: durationMs === null ? EMPTY : formatDuration(durationMs),
    tokens,
    tokensText: tokens === null ? EMPTY : formatTokens(tokens),
    costUsd,
    costText: costUsd === null ? EMPTY : formatCostUsd(costUsd),
  };
}

export async function getRunHistory(): Promise<RunHistoryResult> {
  try {
    const items = await listRunHistory(prisma, { limit: RUN_HISTORY_LIMIT });
    const label = createModelLabeler();
    return { ok: true, data: items.map((item) => runHistoryRow(item, label)) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'RUN_HISTORY_FAILED', message: `실행 이력을 불러오지 못했습니다: ${reason}` },
    };
  }
}
