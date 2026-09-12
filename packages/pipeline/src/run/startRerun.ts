// 재실행 시작 — 승인 대기·실패·완료된 Run을 기준으로 **새 Run**을 만든다(같은 Run 안의 재시도가 아니다,
// decisions/run-execution-model.md §1). 단계 행 6개를 **한 트랜잭션에서 함께** 만든다:
// 범위 밖 앞 단계는 `carried`+`succeeded`+`sourceRunId`, 시작 단계부터는 `pending`+`fresh`.
//
// 그래서 워커는 첫 실행과 똑같이 pending만 잡는다 — 워커 코드에 "재실행"이라는 개념이 들어가지 않는다
// (워커는 오케스트레이션만). 확인 UI가 보여준 계획(`planRerun`)과 실제 행이 같은 계산에서 나온다.
import type { PrismaClient } from '@prisma/client';
import type { ModelRegistry } from '../model/ModelRegistry.ts';
import { resolveCarriedSources } from './carriedSources.ts';
import type { RunSummary } from './runQueries.ts';
import {
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  STEP_STATUS,
  type RerunPlan,
} from './stateMachine.ts';

export interface StartRerunInput {
  /** 이어받을 직전 Run. 같은 주제의 다음 시도가 된다. */
  previousRunId: string;
  /** `planRerun`이 낸 계획 — 확인 UI가 보여준 그것. 여기서 다시 계산하지 않는다. */
  plan: RerunPlan;
  /** 사용자가 입력한 수정 지시 원문. 그대로 저장한다. */
  instruction: string;
  /** 레지스트리 어댑터 id. 없으면 직전 Run의 모델을 그대로 쓴다. */
  modelId?: string;
}

export type StartRerunFailure =
  /** previousRunId에 해당하는 Run이 없음 */
  | 'RUN_NOT_FOUND'
  /** 직전 Run이 아직 실행 중 — 안 끝난 단계를 "이전 결과"로 가져올 수 없다 */
  | 'RUN_IN_PROGRESS'
  /** 같은 주제의 다른 Run이 실행 중 */
  | 'RUN_ALREADY_ACTIVE'
  /** 계획이 6단계를 순서대로 덮지 않음(carried+fresh ≠ STEP_ORDER) */
  | 'INVALID_PLAN'
  /** 이어받을 단계가 직전 Run에서 성공하지 않았음(실패한 Run은 실패 단계부터만 다시 돌 수 있다) */
  | 'CARRIED_STEP_NOT_SUCCEEDED'
  /** 레지스트리에 없는 모델 id */
  | 'UNKNOWN_MODEL'
  /** 등록은 됐지만 API 키가 없어 워커가 실행할 수 없는 모델 */
  | 'MODEL_UNAVAILABLE';

export type StartRerunResult =
  { ok: true; run: RunSummary } | { ok: false; code: StartRerunFailure };

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

function isWholePipeline(plan: RerunPlan): boolean {
  const joined = [...plan.carried, ...plan.fresh];
  return joined.length === STEP_ORDER.length && joined.every((name, i) => name === STEP_ORDER[i]);
}

/**
 * 재실행 Run을 만든다. 실패하면 아무것도 만들지 않는다(던지지 않고 코드로 돌려준다).
 *
 * 직전 Run의 검수 상태는 건드리지 않는다 — 승인 대기에서 수정 지시를 받은 Run을 어떤 종결 상태로
 * 둘지는 승인 게이트 배선(BW4)의 몫이다. 여기서는 새 시도를 만드는 것만 한다.
 *
 * `topicSlug`·`topicTitle`은 직전 Run의 것을 그대로 잇는다 — 이 시도는 같은 폴더(`posts/<슬러그>/`)에
 * 쓰고, carried 단계의 산출물도 그 폴더에 있다. 제목이 그새 바뀌었어도 이 사슬은 옛 슬러그다.
 */
export async function startRerun(
  deps: { prisma: PrismaClient; registry: ModelRegistry },
  input: StartRerunInput,
): Promise<StartRerunResult> {
  if (!isWholePipeline(input.plan)) return { ok: false, code: 'INVALID_PLAN' };

  return deps.prisma.$transaction(async (tx) => {
    const previous = await tx.run.findUnique({
      where: { id: input.previousRunId },
      select: {
        id: true,
        topicId: true,
        topicSlug: true,
        topicTitle: true,
        modelId: true,
        status: true,
        steps: { select: { name: true, status: true } },
      },
    });
    if (!previous) return { ok: false, code: 'RUN_NOT_FOUND' };
    if (previous.status === RUN_STATUS.running) return { ok: false, code: 'RUN_IN_PROGRESS' };

    const adapter = input.modelId
      ? deps.registry.get(input.modelId)
      : deps.registry.get(previous.modelId);
    if (!adapter) return { ok: false, code: 'UNKNOWN_MODEL' };
    if (!adapter.available) return { ok: false, code: 'MODEL_UNAVAILABLE' };

    // 직전 Run 자체는 승인 대기라 finishedAt이 비어 있을 수 있다 — startRun과 달리 "실행 중"만 본다.
    const active = await tx.run.findFirst({
      where: { topicId: previous.topicId, status: RUN_STATUS.running },
      select: { id: true },
    });
    if (active) return { ok: false, code: 'RUN_ALREADY_ACTIVE' };

    const previousStatus = new Map(previous.steps.map((step) => [step.name, step.status]));
    const allCarriedSucceeded = input.plan.carried.every(
      (name) => previousStatus.get(name) === STEP_STATUS.succeeded,
    );
    if (!allCarriedSucceeded) return { ok: false, code: 'CARRIED_STEP_NOT_SUCCEEDED' };

    // 같은 트랜잭션에서 읽어야 승계 사슬(직전이 carried면 그 sourceRunId)이 일관된다.
    const sources = await resolveCarriedSources(tx, previous.id, input.plan.carried);
    const attempts = await tx.run.count({ where: { topicId: previous.topicId } });

    const run = await tx.run.create({
      data: {
        topicId: previous.topicId,
        attempt: attempts + 1,
        topicSlug: previous.topicSlug,
        topicTitle: previous.topicTitle,
        modelId: adapter.id,
        instruction: input.instruction,
        startStep: input.plan.startStep,
        workerState: 'queued',
        steps: {
          createMany: {
            data: STEP_ORDER.map((name, order) =>
              input.plan.carried.includes(name)
                ? {
                    name,
                    order,
                    status: STEP_STATUS.succeeded,
                    origin: STEP_ORIGIN.carried,
                    sourceRunId: sources.get(name) ?? null,
                  }
                : { name, order },
            ),
          },
        },
      },
      select: RUN_SUMMARY_SELECT,
    });
    return { ok: true, run };
  });
}
