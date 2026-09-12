// 주제 실행 시작 — Run을 `queued`로 만들기만 한다. 단계 실행은 워커가 집어간다
// (decisions/run-location.md: 대시보드는 워커에 신호를 보내지 않는다).
// 검수 상태(status)와 전이 규칙은 상태 머신(B1a)이 소유하므로 여기서는 스키마 기본값을 그대로 둔다.
import type { PrismaClient } from '@prisma/client';
import type { ModelRegistry } from '../model/ModelRegistry';
import { topicSlug } from '../queue/topicSlug';
import type { RunSummary } from './runQueries';

export interface StartRunInput {
  /** 큐 행의 제목. 주제 키(슬러그)는 여기서 파생한다 — decisions/queue-sync-direction.md. */
  title: string;
  /** 레지스트리 어댑터 id(`provider:model`). 없으면 레지스트리 기본 모델. */
  modelId?: string;
}

export type StartRunFailure =
  /** 제목이 비었음(공백만 포함) */
  | 'EMPTY_TITLE'
  /** 레지스트리에 없는 모델 id */
  | 'UNKNOWN_MODEL'
  /** 등록은 됐지만 API 키가 없어 워커가 실행할 수 없는 모델 */
  | 'MODEL_UNAVAILABLE'
  /** 같은 주제의 실행이 아직 끝나지 않았음 */
  | 'RUN_ALREADY_ACTIVE';

export type StartRunResult = { ok: true; run: RunSummary } | { ok: false; code: StartRunFailure };

const RUN_SUMMARY_SELECT = {
  id: true,
  topicSlug: true,
  topicTitle: true,
  status: true,
  modelId: true,
  startedAt: true,
  finishedAt: true,
} as const;

/**
 * 주제 하나를 큐에 올린다. 모델을 확인하고, 같은 주제가 아직 돌고 있지 않을 때만 Run을 만든다.
 * 실패하면 아무것도 만들지 않는다(던지지 않고 코드로 돌려준다).
 */
export async function startRun(
  deps: { prisma: PrismaClient; registry: ModelRegistry },
  input: StartRunInput,
): Promise<StartRunResult> {
  const title = input.title.trim();
  if (title === '') return { ok: false, code: 'EMPTY_TITLE' };

  const adapter = input.modelId ? deps.registry.get(input.modelId) : deps.registry.default();
  if (!adapter) return { ok: false, code: 'UNKNOWN_MODEL' };
  if (!adapter.available) return { ok: false, code: 'MODEL_UNAVAILABLE' };

  // 끝나지 않은 실행(대기·실행 중·중단·승인 대기)은 finishedAt이 비어 있다. workerState 값을
  // 해석하지 않아도 되고, 중단된 실행은 워커가 재개하므로 새로 만들면 같은 주제가 두 번 돈다.
  const slug = topicSlug(title);
  const active = await deps.prisma.run.findFirst({
    where: { topicSlug: slug, finishedAt: null },
    select: { id: true },
  });
  if (active) return { ok: false, code: 'RUN_ALREADY_ACTIVE' };

  const run = await deps.prisma.run.create({
    data: { topicSlug: slug, topicTitle: title, modelId: adapter.id, workerState: 'queued' },
    select: RUN_SUMMARY_SELECT,
  });
  return { ok: true, run };
}
