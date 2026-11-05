// 홈 "지금 할 일"(승인 대기 실행)·"최근 실행" 카드 데이터(서버 전용) — decisions/layout.md §4 행 2·행 3.
// 카운트는 타일·배지와 같은 소스(countPendingApproval), 행은 실행 목록과 같은 조회(listRuns)를 쓴다.
// 홈 전용 API는 없다 — 서버 컴포넌트가 직접 부르고, 실패는 값으로 돌려 홈 전체가 죽지 않게 한다.
import 'server-only';
import {
  countPendingApproval,
  createModelRegistryFromEnv,
  listRecentRuns,
  prisma,
  type RunSummary,
} from '@galley/pipeline';
import { getRunVerificationFlags, type VerificationFlags } from './run-artifacts';
import { runStatusBadge, type RunStatusBadge } from './run-labels';
import { getRunList, type RunListRow } from './run-list';
import { evidenceFlagText, formatShortDateTime, runListRowView } from './run-list-row';
import { runsHref } from './run-view';

/** 카드 한 장에 보여 주는 행 수. 넘치면 "n개 더 보기". */
export const HOME_RUN_LIMIT = 5;

export interface TodoRunRow {
  id: string;
  title: string;
  /** "마지막 단계 · 대기 시작 시각". */
  meta: string;
  /** 상태 배지 옆 작은 텍스트 — 근거 없는 주장이 있을 때만("근거 없음 n"). */
  flag: string | undefined;
  badge: RunStatusBadge;
  /** `검수` → 실행 상세. */
  href: string;
}

export interface TodoRunsView {
  rows: TodoRunRow[];
  /** 카드에 못 실은 승인 대기 수(0이면 "더 보기" 없음). */
  moreCount: number;
  /** "n개 더 보기" → 승인 대기만 거른 실행 목록. */
  moreHref: string;
}

export interface RecentRunRow {
  id: string;
  title: string;
  badge: RunStatusBadge;
  /** 모델 label(레지스트리에 없는 id는 id 그대로). */
  model: string;
  /** 종결됐으면 종결 시각, 아니면 시작 시각. */
  time: string;
  href: string;
}

export interface HomeRunsView {
  todo: TodoRunsView;
  recent: RecentRunRow[];
}

export type HomeRunsResult =
  | { ok: true; data: HomeRunsView }
  | { ok: false; error: { code: 'HOME_RUNS_FAILED'; message: string } };

/** 승인 대기가 시작된 시각 — 마지막으로 끝난 단계의 종료 시각. 단계 기록이 없으면 실행 시작 시각. */
export function pendingSince(row: RunListRow): string {
  let latest: string | undefined;
  for (const step of row.steps) {
    if (step.finishedAt !== null && (latest === undefined || step.finishedAt > latest)) {
      latest = step.finishedAt;
    }
  }
  return latest ?? row.startedAt;
}

/** 승인 대기 행(순수). `flags`는 Run id → 검증 결과 수(없는 행은 표시 없음). */
export function buildTodoRows(
  rows: readonly RunListRow[],
  flags: Record<string, VerificationFlags>,
): TodoRunRow[] {
  return rows.map((row) => ({
    id: row.id,
    title: row.topicTitle,
    meta: `${runListRowView(row).lastStep} · ${formatShortDateTime(pendingSince(row))}`,
    flag: evidenceFlagText(flags[row.id]),
    badge: runStatusBadge(row.status),
    href: runsHref({ selectedId: row.id }),
  }));
}

/** 최근 실행 행(순수). 종결된 실행은 완료 탭에서 고른 채 연다. */
export function buildRecentRows(
  runs: readonly RunSummary[],
  modelLabel: (modelId: string) => string,
): RecentRunRow[] {
  return runs.map((run) => ({
    id: run.id,
    title: run.topicTitle,
    badge: runStatusBadge(run.status),
    model: modelLabel(run.modelId),
    time: formatShortDateTime((run.finishedAt ?? run.startedAt).toISOString()),
    href: runsHref({ tab: run.finishedAt === null ? 'active' : 'done', selectedId: run.id }),
  }));
}

/** 홈 두 카드의 데이터. 던지지 않는다 — 실패하면 봉투로(카드가 문구를 보인다). */
export async function getHomeRuns(): Promise<HomeRunsResult> {
  try {
    const [pending, pendingCount, recent] = await Promise.all([
      getRunList({ tab: 'active', pendingOnly: true, limit: HOME_RUN_LIMIT }),
      countPendingApproval(prisma),
      listRecentRuns(prisma, HOME_RUN_LIMIT),
    ]);
    if (!pending.ok)
      return { ok: false, error: { code: 'HOME_RUNS_FAILED', message: pending.error.message } };
    // "근거 없음 n"은 각 Run의 verification.json(DATA_DIR)에서 — 못 읽는 행은 조용히 빠진다(실행 목록과 같다).
    const flags = await getRunVerificationFlags(pending.data);
    const registry = createModelRegistryFromEnv(process.env);
    return {
      ok: true,
      data: {
        todo: {
          rows: buildTodoRows(pending.data, flags),
          moreCount: Math.max(0, pendingCount - pending.data.length),
          moreHref: runsHref({ pendingOnly: true }),
        },
        recent: buildRecentRows(recent, (id) => registry.get(id)?.label ?? id),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'HOME_RUNS_FAILED', message: `실행 현황을 불러오지 못했습니다: ${reason}` },
    };
  }
}
