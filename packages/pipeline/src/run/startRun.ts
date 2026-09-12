// 주제 실행 시작 — Run을 `queued`로 만들기만 한다. 단계 실행은 워커가 집어간다
// (decisions/run-location.md: 대시보드는 워커에 신호를 보내지 않는다).
// 검수 상태(status)와 전이 규칙은 상태 머신(B1a)이 소유하므로 여기서는 스키마 기본값을 그대로 둔다.
import type { PrismaClient } from '@prisma/client';
import type { ModelRegistry } from '../model/ModelRegistry.ts';
import { topicSlug } from '../queue/topicSlug.ts';
import type { RunSummary } from './runQueries.ts';

export interface StartRunInput {
  /** 주제 키 = `QueueItem.id`. 내용에서 파생되지 않아 제목이 바뀌어도 이력이 끊기지 않는다. */
  topicId: string;
  /** 레지스트리 어댑터 id(`provider:model`). 없으면 레지스트리 기본 모델. */
  modelId?: string;
}

export type StartRunFailure =
  /** 큐에 없는 주제 id */
  | 'TOPIC_NOT_FOUND'
  /** 큐 항목의 제목이 비었음(공백만) */
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
  topicId: true,
  attempt: true,
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
 *
 * `topicSlug`·`topicTitle`은 **그 실행 시점의 사실 기록**으로 함께 저장한다 — 이 Run이 어느
 * 폴더에 썼는지 알아야 하고, 나중에 제목이 바뀌어도 과거 Run의 폴더는 옛 슬러그다.
 * `attempt`는 `topicId` 기준으로 센다(재실행은 새 Run — decisions/run-execution-model.md).
 */
export async function startRun(
  deps: { prisma: PrismaClient; registry: ModelRegistry },
  input: StartRunInput,
): Promise<StartRunResult> {
  const topic = await deps.prisma.queueItem.findUnique({
    where: { id: input.topicId },
    select: { id: true, title: true },
  });
  if (!topic) return { ok: false, code: 'TOPIC_NOT_FOUND' };

  const title = topic.title.trim();
  if (title === '') return { ok: false, code: 'EMPTY_TITLE' };

  const adapter = input.modelId ? deps.registry.get(input.modelId) : deps.registry.default();
  if (!adapter) return { ok: false, code: 'UNKNOWN_MODEL' };
  if (!adapter.available) return { ok: false, code: 'MODEL_UNAVAILABLE' };

  // 끝나지 않은 실행(대기·실행 중·중단·승인 대기)은 finishedAt이 비어 있다. workerState 값을
  // 해석하지 않아도 되고, 중단된 실행은 워커가 재개하므로 새로 만들면 같은 주제가 두 번 돈다.
  const active = await deps.prisma.run.findFirst({
    where: { topicId: topic.id, finishedAt: null },
    select: { id: true },
  });
  if (active) return { ok: false, code: 'RUN_ALREADY_ACTIVE' };

  const previous = await deps.prisma.run.count({ where: { topicId: topic.id } });

  const run = await deps.prisma.run.create({
    data: {
      topicId: topic.id,
      attempt: previous + 1,
      topicSlug: topicSlug(title),
      topicTitle: title,
      modelId: adapter.id,
      workerState: 'queued',
    },
    select: RUN_SUMMARY_SELECT,
  });
  return { ok: true, run };
}
