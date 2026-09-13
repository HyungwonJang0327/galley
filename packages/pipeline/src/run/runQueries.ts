// 실행(Run) 조회 — 홈 타일·사이드바 배지·실행 목록·실행 상세가 쓰는 읽기 집합.
// 상태 어휘와 전이는 상태 머신(stateMachine.ts)이 소유하고, 여기서는 읽기만 한다.
import type { Prisma, PrismaClient } from '@prisma/client';
import { RUN_STATUS, STEP_ORIGIN } from './stateMachine.ts';

export interface RunSummary {
  id: string;
  /** 주제 키(QueueItem.id). 목록은 이 키로 묶고 최신 시도를 대표로 보여준다. */
  topicId: string;
  /** 이 주제의 몇 번째 시도인가(1부터). */
  attempt: number;
  topicSlug: string;
  topicTitle: string;
  status: string;
  modelId: string;
  startedAt: Date;
  finishedAt: Date | null;
}

/** 검수 상태별 개수(홈 타일·사이드바 배지가 같은 소스를 쓰도록). */
export async function countRunsByStatus(prisma: PrismaClient, status: string): Promise<number> {
  return prisma.run.count({ where: { status } });
}

/** 승인 대기 실행 수 — 홈 "승인 대기" 타일과 사이드바 배지. */
export async function countPendingApproval(prisma: PrismaClient): Promise<number> {
  return countRunsByStatus(prisma, RUN_STATUS.pendingApproval);
}

/** 최근 실행 목록(최신순). 홈 "최근 실행"·실행 이력 화면이 쓴다. */
export async function listRecentRuns(prisma: PrismaClient, limit = 5): Promise<RunSummary[]> {
  const rows = await prisma.run.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      topicId: true,
      attempt: true,
      topicSlug: true,
      topicTitle: true,
      status: true,
      modelId: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return rows;
}

/** 주제의 최근 시도 하나 — 큐 완료 행의 실행 상세 링크에 쓴다. 키는 QueueItem.id다. */
export async function findLatestRunForTopic(
  prisma: PrismaClient,
  topicId: string,
): Promise<RunSummary | null> {
  const row = await prisma.run.findFirst({
    where: { topicId },
    orderBy: { attempt: 'desc' },
    select: {
      id: true,
      topicId: true,
      attempt: true,
      topicSlug: true,
      topicTitle: true,
      status: true,
      modelId: true,
      startedAt: true,
      finishedAt: true,
    },
  });
  return row;
}

// ── 실행 목록(2분할 화면 좌측) ────────────────────────────────────────────────

export interface RunListFilter {
  /**
   * `active` = 아직 끝나지 않은 실행(`finishedAt` null — 실행 중·승인 대기),
   * `done` = 종결된 실행(승인·실패·수정 지시로 넘어간 시도 전부). 탭 두 개가 이 둘이다.
   * 검수 상태가 아니라 종결 여부로 가르는 이유: startRun의 중복 판정과 같은 기준이어야
   * "진행 중 탭에 있는데 새 실행이 거부된다" 같은 어긋남이 없다.
   */
  tab: 'active' | 'done';
  /** 승인 대기만(체크박스). `done` 탭에서는 아무것도 남지 않는다. */
  pendingOnly?: boolean;
  /** 주제 제목 부분 일치(검색창). 공백만이면 무시. */
  query?: string;
  limit?: number;
}

export interface RunListStep {
  name: string;
  status: string;
  origin: string;
}

/** 목록 한 줄. 단계 6개의 상태·출처를 같이 준다 — 원형 진행 인디케이터·마지막 단계 미리보기용. */
export interface RunListItem extends RunSummary {
  steps: RunListStep[];
}

const RUN_SUMMARY_SELECT = {
  id: true,
  topicId: true,
  attempt: true,
  topicSlug: true,
  topicTitle: true,
  status: true,
  modelId: true,
  startedAt: true,
  finishedAt: true,
} satisfies Prisma.RunSelect;

/**
 * 실행 목록. `active`는 시작 시각 최신순, `done`은 종결 시각 최신순.
 * 한 주제의 시도가 여럿이면 각각 한 줄이다(attempt로 구분) — 묶기는 화면이 정한다.
 */
export async function listRuns(
  prisma: PrismaClient,
  filter: RunListFilter,
): Promise<RunListItem[]> {
  const query = filter.query?.trim();
  const where: Prisma.RunWhereInput = {
    finishedAt: filter.tab === 'active' ? null : { not: null },
    ...(filter.pendingOnly ? { status: RUN_STATUS.pendingApproval } : {}),
    ...(query ? { topicTitle: { contains: query } } : {}),
  };
  const rows = await prisma.run.findMany({
    where,
    orderBy: filter.tab === 'active' ? { startedAt: 'desc' } : { finishedAt: 'desc' },
    take: filter.limit,
    select: {
      ...RUN_SUMMARY_SELECT,
      steps: { orderBy: { order: 'asc' }, select: { name: true, status: true, origin: true } },
    },
  });
  return rows;
}

// ── 실행 상세(2분할 화면 우측 타임라인) ───────────────────────────────────────

export interface RunStepDetail {
  name: string;
  order: number;
  status: string;
  origin: string;
  /** carried일 때 그 결과를 실제로 생산한 Run. fresh면 null. */
  sourceRunId: string | null;
  /**
   * carried일 때 원본 단계가 끝난 시각("이전 결과 · {시각}"). Run 종결 시각이 아니라 **그 단계의**
   * 종료 시각이다 — 출처 Run이 `revised`로 끝났다면 Run.finishedAt은 수정 지시 시각이라 생산
   * 시점과 어긋난다(decisions/evidence-collection.md 출처 승계). 복사하지 않고 매번 참조한다.
   */
  sourceFinishedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface RunDetail extends RunSummary {
  /** 워커 실행 상태(queued | running | interrupted). 폴링 여부는 검수 상태(`status`)로 정한다. */
  workerState: string;
  heartbeat: Date | null;
  /** 재실행이면 그때의 수정 지시 원문·시작 단계. 첫 실행은 둘 다 null. */
  instruction: string | null;
  startStep: string | null;
  /** 파이프라인 순서(order 오름차순) 6행. */
  steps: RunStepDetail[];
}

/** 실행 하나 + 단계 전부. 없으면 null. */
export async function getRunWithSteps(prisma: PrismaClient, id: string): Promise<RunDetail | null> {
  const run = await prisma.run.findUnique({
    where: { id },
    select: {
      ...RUN_SUMMARY_SELECT,
      workerState: true,
      heartbeat: true,
      instruction: true,
      startStep: true,
      steps: {
        orderBy: { order: 'asc' },
        select: {
          name: true,
          order: true,
          status: true,
          origin: true,
          sourceRunId: true,
          errorCode: true,
          errorMessage: true,
          attemptCount: true,
          modelId: true,
          inputTokens: true,
          outputTokens: true,
          costUsd: true,
          durationMs: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });
  if (!run) return null;

  // carried 행의 원본 단계 종료 시각 — 출처 Run들의 같은 이름 단계를 한 번에 읽는다.
  const carried = run.steps.filter((s) => s.origin === STEP_ORIGIN.carried && s.sourceRunId);
  const sourceRunIds = [...new Set(carried.map((s) => s.sourceRunId as string))];
  const sourceSteps =
    sourceRunIds.length === 0
      ? []
      : await prisma.runStep.findMany({
          where: { runId: { in: sourceRunIds }, name: { in: carried.map((s) => s.name) } },
          select: { runId: true, name: true, finishedAt: true },
        });
  const finishedAtOf = new Map(sourceSteps.map((s) => [`${s.runId}:${s.name}`, s.finishedAt]));

  const { steps, ...rest } = run;
  return {
    ...rest,
    steps: steps.map((step) => ({
      ...step,
      sourceFinishedAt:
        step.origin === STEP_ORIGIN.carried && step.sourceRunId
          ? (finishedAtOf.get(`${step.sourceRunId}:${step.name}`) ?? null)
          : null,
    })),
  };
}
