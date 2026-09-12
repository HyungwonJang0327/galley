// carried 단계의 출처 조회 — "이 단계의 이전 결과를 실제로 생산한 Run은 어디인가".
// 범위(fresh/carried)는 순수 함수 planRerun이 정하고, 출처는 이전 Run의 기록을 읽어야 하므로
// 여기(리포지토리)에 있다. 재실행 확인 API 하나가 둘을 조합해 화면에 넘긴다.
import type { PrismaClient } from '@prisma/client';
import { STEP_ORIGIN, isStepName, type StepName } from './stateMachine';

/**
 * 직전 Run의 단계 기록에서 carried 단계들의 출처 Run을 찾는다.
 *
 * **승계 규칙**: 직전 Run의 그 단계 행이 `fresh`면 직전 Run이 생산자이고, 이미 `carried`면
 * 그 행의 `sourceRunId`를 **그대로 승계**한다. 승계하지 않고 직전 Run을 가리키면 재실행을
 * 반복할수록 출처가 한 칸씩 밀려, 타임라인의 "이전 결과 · {원래 실행 시각}"이 실제 생산
 * 시점과 어긋난다(decisions/evidence-collection.md 요구사항 3).
 *
 * 기록이 없거나 carried인데 `sourceRunId`가 비어 있는 단계는 Map에서 빠진다 — 화면은
 * 시각 없이 그리면 된다(없는 출처를 지어내지 않는다).
 */
export async function resolveCarriedSources(
  prisma: PrismaClient,
  previousRunId: string,
  steps: readonly StepName[],
): Promise<Map<StepName, string>> {
  if (steps.length === 0) return new Map();

  const rows = await prisma.runStep.findMany({
    where: { runId: previousRunId, name: { in: [...steps] } },
    select: { name: true, origin: true, sourceRunId: true },
  });

  const sources = new Map<StepName, string>();
  for (const row of rows) {
    if (!isStepName(row.name)) continue;
    const producer = row.origin === STEP_ORIGIN.carried ? row.sourceRunId : previousRunId;
    if (producer) sources.set(row.name, producer);
  }
  return sources;
}
