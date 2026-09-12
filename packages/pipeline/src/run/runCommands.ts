// 승인 게이트 배선 — 사람이 승인 대기 Run에 내리는 명령 둘(승인·수정 지시)과 수정 지시 미리보기.
// 전이는 상태 머신 `applyCommand`가 정하고, 여기서는 그 답을 DB에 쓴다. 대시보드는 Run 상태를
// 바꿀 뿐 워커에 신호를 보내지 않는다 — 새 Run이 queued로 생기면 워커가 폴링으로 집어간다
// (decisions/run-location.md). 실패는 값으로 돌려준다(CLAUDE.md §4).
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ModelRegistry } from '../model/ModelRegistry.ts';
import { resolveCarriedSources } from './carriedSources.ts';
import type { RunSummary } from './runQueries.ts';
import { startRerunIn, type StartRerunFailure } from './startRerun.ts';
import {
  INSTRUCTION_MAX_LENGTH,
  applyCommand,
  isRunStatus,
  planRerun,
  type CommandFailure,
  type RerunInput,
  type RerunPlan,
  type StepName,
} from './stateMachine.ts';

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
} as const;

/** 수정 지시가 상한을 넘음 — 미리보기·수정 지시가 같은 값(`INSTRUCTION_MAX_LENGTH`)으로 거절한다. */
type InstructionFailure = 'INSTRUCTION_TOO_LONG';

function instructionTooLong(instruction: string): boolean {
  return instruction.length > INSTRUCTION_MAX_LENGTH;
}

// ── 승인 ─────────────────────────────────────────────────────────────────────

export type ApproveRunFailure = 'RUN_NOT_FOUND' | CommandFailure;
export type ApproveRunResult =
  { ok: true; run: RunSummary } | { ok: false; code: ApproveRunFailure };

/**
 * 승인 — Run을 `done`으로 끝낸다. 승인 대기가 아니면 `NOT_PENDING_APPROVAL`.
 * 갱신은 **읽은 상태를 조건에 넣은 updateMany**로 한다 — 읽고 쓰는 사이에 상태가 바뀌었으면
 * 0건이 되고, 그때는 다시 읽어 지금 상태로 거절한다(두 번 승인·승인과 수정 지시 경합 방지).
 */
export async function approveRun(
  prisma: PrismaClient,
  runId: string,
  now: Date = new Date(),
): Promise<ApproveRunResult> {
  const current = await prisma.run.findUnique({ where: { id: runId }, select: { status: true } });
  if (!current) return { ok: false, code: 'RUN_NOT_FOUND' };
  if (!isRunStatus(current.status)) return { ok: false, code: 'NOT_PENDING_APPROVAL' };

  const decision = applyCommand(current.status, { type: 'approve' });
  if (!decision.ok) return decision;

  const { count } = await prisma.run.updateMany({
    where: { id: runId, status: current.status },
    data: { status: decision.status, finishedAt: now, workerId: null },
  });
  if (count === 0) return { ok: false, code: 'NOT_PENDING_APPROVAL' };

  const run = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    select: RUN_SUMMARY_SELECT,
  });
  return { ok: true, run };
}

// ── 수정 지시 ────────────────────────────────────────────────────────────────

export interface ReviseRunInput extends RerunInput {
  runId: string;
  /** 새 시도의 모델. 없으면 직전 Run의 모델을 잇는다. */
  modelId?: string;
}

export type ReviseRunFailure =
  | 'RUN_NOT_FOUND'
  | CommandFailure
  | InstructionFailure
  | Exclude<StartRerunFailure, 'RUN_NOT_FOUND' | 'RUN_IN_PROGRESS' | 'INVALID_PLAN'>;

export type ReviseRunResult =
  /** `previous`는 `revised`로 끝난 그 Run, `run`은 새로 queued된 다음 시도. */
  | { ok: true; previous: RunSummary; run: RunSummary; plan: RerunPlan }
  | { ok: false; code: ReviseRunFailure };

/** 트랜잭션 안에서 값-실패를 만나면 이걸 던져 롤백하고, 밖에서 다시 값으로 바꾼다. */
class Rollback extends Error {
  readonly code: ReviseRunFailure;
  constructor(code: ReviseRunFailure) {
    super(code);
    this.name = 'Rollback';
    this.code = code;
  }
}

/**
 * 수정 지시 — 이 Run을 `revised`로 끝내고 **새 Run**을 시작 단계부터 queued로 만든다. 둘은 한
 * 트랜잭션이다: 새 Run이 못 생기면 이 Run도 그대로 승인 대기로 남는다.
 *
 * 순서는 새 Run 생성(`startRerunIn`, 실패해도 아무것도 쓰지 않음) → 이 Run 종결(조건부
 * updateMany). 종결이 0건이면 그새 상태가 바뀐 것이므로 던져서 새 Run까지 되돌린다.
 */
export async function reviseRun(
  deps: { prisma: PrismaClient; registry: ModelRegistry },
  input: ReviseRunInput,
  now: Date = new Date(),
): Promise<ReviseRunResult> {
  if (instructionTooLong(input.instruction)) return { ok: false, code: 'INSTRUCTION_TOO_LONG' };

  try {
    return await deps.prisma.$transaction(async (tx) => {
      const current = await tx.run.findUnique({
        where: { id: input.runId },
        select: { status: true },
      });
      if (!current) return { ok: false, code: 'RUN_NOT_FOUND' };
      if (!isRunStatus(current.status)) return { ok: false, code: 'NOT_PENDING_APPROVAL' };

      const decision = applyCommand(current.status, {
        type: 'revise',
        startStep: input.startStep,
        instruction: input.instruction,
      });
      if (!decision.ok) return decision;
      // revise의 결과에는 항상 계획이 있다 — 없으면 상태 머신 계약 위반이다.
      if (!decision.rerun) throw new Error('revise 결과에 재실행 계획이 없다');

      const created = await startRerunIn(tx, deps.registry, {
        previousRunId: input.runId,
        plan: decision.rerun,
        instruction: input.instruction,
        modelId: input.modelId,
      });
      if (!created.ok) {
        // 여기 닿는 코드는 ReviseRunFailure에 있는 것뿐이다(RUN_NOT_FOUND·RUN_IN_PROGRESS·INVALID_PLAN은
        // 위 조회·applyCommand·planRerun이 이미 걸렀다). 타입으로 좁혀지지 않아 단언한다.
        return { ok: false, code: created.code as ReviseRunFailure };
      }

      const { count } = await tx.run.updateMany({
        where: { id: input.runId, status: current.status },
        data: { status: decision.status, finishedAt: now, workerId: null },
      });
      if (count === 0) throw new Rollback('NOT_PENDING_APPROVAL');

      const previous = await tx.run.findUniqueOrThrow({
        where: { id: input.runId },
        select: RUN_SUMMARY_SELECT,
      });
      return { ok: true, previous, run: created.run, plan: decision.rerun };
    });
  } catch (error) {
    if (error instanceof Rollback) return { ok: false, code: error.code };
    throw error;
  }
}

// ── 미리보기 ─────────────────────────────────────────────────────────────────

export interface PreviewRerunInput extends RerunInput {
  runId: string;
}

export type PreviewRerunFailure = 'RUN_NOT_FOUND' | InstructionFailure;

export interface RerunPreview {
  plan: RerunPlan;
  /** carried 단계 → 그 결과를 실제로 생산한 Run id. 출처를 모르는 단계는 빠진다. */
  sources: Partial<Record<StepName, string>>;
}

export type PreviewRerunResult =
  { ok: true; preview: RerunPreview } | { ok: false; code: PreviewRerunFailure };

/**
 * 재실행 확인 Dialog용 — "다시 도는 단계"와 "이전 결과 유지(어느 실행의)"를 실행 전에 보여준다.
 * **`reviseRun`과 같은 `planRerun`·`resolveCarriedSources`를 부른다** — 같은 입력이면 실제로
 * 만들어질 행과 정확히 일치해야 한다(테스트가 고정). 부작용이 없다.
 *
 * 상태는 보지 않는다 — 계산일 뿐이고, 실제 거절은 `reviseRun`이 한다.
 */
export async function previewRerun(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: PreviewRerunInput,
): Promise<PreviewRerunResult> {
  if (instructionTooLong(input.instruction)) return { ok: false, code: 'INSTRUCTION_TOO_LONG' };

  const run = await prisma.run.findUnique({ where: { id: input.runId }, select: { id: true } });
  if (!run) return { ok: false, code: 'RUN_NOT_FOUND' };

  const plan = planRerun({ startStep: input.startStep, instruction: input.instruction });
  const sources = await resolveCarriedSources(prisma, run.id, plan.carried);
  return { ok: true, preview: { plan, sources: Object.fromEntries(sources) } };
}
