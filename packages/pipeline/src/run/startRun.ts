// 주제 실행 시작 — Run을 `queued`로 만들기만 한다. 단계 실행은 워커가 집어간다
// (decisions/run-location.md: 대시보드는 워커에 신호를 보내지 않는다).
// 검수 상태(status)와 전이 규칙은 상태 머신(B1a)이 소유하므로 여기서는 스키마 기본값을 그대로 둔다.
import type { PrismaClient } from '@prisma/client';
import type { ModelRegistry } from '../model/ModelRegistry.ts';
import { stripTopicHints } from '../queue/normalizeTitle.ts';
import type { QueueStatus } from '../queue/queueFile.ts';
import { postsPointerSlug } from '../queue/postsPointer.ts';
import { slugForTopicTitle } from '../queue/topicSlug.ts';
import type { RunSummary } from './runQueries.ts';
import { RUN_STATUS } from './stateMachine.ts';

/** QueueItem.status의 완료 값 — 큐 상태는 아직 파일 어휘(한국어)로 저장된다(todo TD1). */
const DONE_STATUS: QueueStatus = '완료';

export interface StartRunInput {
  /** 주제 키 = `QueueItem.id`. 내용에서 파생되지 않아 제목이 바뀌어도 이력이 끊기지 않는다. */
  topicId: string;
  /** 레지스트리 어댑터 id(`provider:model`). 없으면 레지스트리 기본 모델. */
  modelId?: string;
}

export type StartRunFailure =
  /** 큐에 없는 주제 id */
  | 'TOPIC_NOT_FOUND'
  /** 이미 완료된 주제 — 다시 쓰려면 먼저 큐에서 되돌린다(decisions/topic-slug.md 규칙 3) */
  | 'TOPIC_ALREADY_DONE'
  /** 큐 항목의 제목이 비었음(공백만·괄호 힌트뿐) */
  | 'EMPTY_TITLE'
  /** 레지스트리에 없는 모델 id */
  | 'UNKNOWN_MODEL'
  /** 등록은 됐지만 API 키가 없어 워커가 실행할 수 없는 모델 */
  | 'MODEL_UNAVAILABLE'
  /** 같은 주제의 실행이 아직 끝나지 않았음 */
  | 'RUN_ALREADY_ACTIVE'
  /**
   * 이 주제의 첫 실행인데 슬러그가 **다른 주제의 승인된 실행**과 같다 — 승인하면 POSTS_DIR_EXISTS로 거절될 것을 실행 전에
   * 안다(비용). 되돌리면서 제목을 고쳤거나 날짜를 안 뗀 줄, 힌트 뗀 제목이 같은 두 주제(decisions/topic-slug.md).
   */
  | 'SLUG_TAKEN';

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
 * 폴더에 썼는지 알아야 한다. 슬러그는 주제 안에서 승계하므로(아래 `inheritedSlug`) 제목이 바뀌어도 같은 주제의
 * Run은 같은 폴더를 쓴다. `topicTitle`은 그 시점의 제목이다.
 * `attempt`는 `topicId` 기준으로 센다(재실행은 새 Run — decisions/run-execution-model.md).
 */
export async function startRun(
  deps: { prisma: PrismaClient; registry: ModelRegistry },
  input: StartRunInput,
): Promise<StartRunResult> {
  const topic = await deps.prisma.queueItem.findUnique({
    where: { id: input.topicId },
    select: { id: true, title: true, status: true },
  });
  if (!topic) return { ok: false, code: 'TOPIC_NOT_FOUND' };
  // 완료 주제는 실행하지 않는다 — 승인이 TOPIC_NOT_IN_QUEUE(완료)로 거절할 것을 6단계를 다 돌린 뒤에야 알게 된다
  // (비용). 다시 쓰려면 주제_큐.md에서 완료 줄을 대기로 되돌린다(decisions/topic-slug.md "되돌리기 절차").
  if (topic.status === DONE_STATUS) return { ok: false, code: 'TOPIC_ALREADY_DONE' };

  const title = topic.title.trim();
  // 괄호 힌트뿐인 제목(`(spacehome)`)도 빈 제목이다 — 힌트를 떼면 프롬프트 제목이 비고 슬러그가 전부 `topic`으로
  // 뭉친다(TS1 리뷰 M1, 사용자 결정). 비용을 쓰기 전에 막는다.
  if (stripTopicHints(title) === '') return { ok: false, code: 'EMPTY_TITLE' };

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
  const inherited = await inheritedSlug(deps.prisma, topic.id);
  // 승계할 실행이 없으면 제목에 적힌 산출물 위치 `(posts/<슬러그>)`(되돌린 완료 줄 — DB를 초기화해도 기존 폴더와
  // 같은 슬러그), 그것도 없으면 힌트(리포 별칭·기간)를 뗀 제목에서 파생(규칙 1).
  const slug = inherited ?? postsPointerSlug(title) ?? slugForTopicTitle(title);
  if (inherited === undefined) {
    const taken = await deps.prisma.run.findFirst({
      where: { topicSlug: slug, status: RUN_STATUS.done, topicId: { not: topic.id } },
      select: { id: true },
    });
    if (taken) return { ok: false, code: 'SLUG_TAKEN' };
  }

  const run = await deps.prisma.run.create({
    data: {
      topicId: topic.id,
      attempt: previous + 1,
      topicSlug: slug,
      topicTitle: title,
      modelId: adapter.id,
      workerState: 'queued',
    },
    select: RUN_SUMMARY_SELECT,
  });
  return { ok: true, run };
}

/**
 * 같은 주제의 실행은 슬러그를 승계한다(decisions/topic-slug.md 규칙 2) — 제목·힌트를 고쳤거나 완료 줄을 되돌려도 주제당
 * 폴더는 하나다. **승인된(done) 실행이 있으면 그중 가장 최근 것**(posts 폴더가 실제로 있는 슬러그), 없으면 가장 최근
 * 실행. 규칙 1·2 전에 만든 주제는 한 주제에 슬러그가 섞여 있을 수 있어 "어느 Run이든 같은 값"을 가정하지 않는다.
 */
async function inheritedSlug(prisma: PrismaClient, topicId: string): Promise<string | undefined> {
  const select = { topicSlug: true } as const;
  const orderBy = { attempt: 'desc' } as const;
  const approved = await prisma.run.findFirst({
    where: { topicId, status: RUN_STATUS.done },
    orderBy,
    select,
  });
  if (approved) return approved.topicSlug;
  return (await prisma.run.findFirst({ where: { topicId }, orderBy, select }))?.topicSlug;
}
