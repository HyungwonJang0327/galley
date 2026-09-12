// 파일에서 사라졌는데 Run이 붙어 있어 **자동으로 내리지 않고 사람에게 묻는** 항목들.
// 줄 텍스트로 매칭하므로 제목 오타를 고치면 파서에게는 "줄 삭제 + 줄 추가"로 보인다 —
// 그대로 내리면 이력이 붙은 항목이 조용히 보류로 가고 새 항목이 생겨 Run 이력이 갈라진다.
// (decisions/queue-sync-direction.md "사라진 줄 처리")
import type { PrismaClient } from '@prisma/client';
import { importQueueFromFile } from './importQueue';
import { parseQueue, serializeQueue } from './queueFile';
import { RUN_STATUS } from '../run/stateMachine';
import type { Storage } from '../storage/Storage';

export interface MissingTopic {
  id: string;
  /** 사라지기 직전의 줄 원문(괄호 힌트 포함). 되살릴 때 이걸 그대로 쓴다. */
  title: string;
  missingSince: Date;
  /** 이 주제에 쌓인 실행 수 — 화면이 "왜 묻는지"를 설명할 때 쓴다. */
  runCount: number;
}

/** 아직 답하지 않은 확인 대기 항목만. 답한 것(`missingAck`)은 다시 묻지 않는다. */
export async function listMissingTopics(prisma: PrismaClient): Promise<MissingTopic[]> {
  const rows = await prisma.queueItem.findMany({
    where: { missingSince: { not: null }, missingAck: null },
    orderBy: { missingSince: 'asc' },
    select: { id: true, title: true, missingSince: true, _count: { select: { runs: true } } },
  });

  return rows.flatMap((row) =>
    row.missingSince === null
      ? []
      : [
          {
            id: row.id,
            title: row.title,
            missingSince: row.missingSince,
            runCount: row._count.runs,
          },
        ],
  );
}

export type MissingTopicFailure =
  /** 그 id의 큐 항목이 없다 */
  | 'TOPIC_NOT_FOUND'
  /** 확인 대기 상태가 아니다(그새 줄이 돌아왔거나 이미 답했다) */
  | 'NOT_MISSING'
  /** 완료 Run이 있는 항목 — 파일에 되살리지 않는다 */
  | 'TOPIC_DONE';

export type MissingTopicResult = { ok: true } | { ok: false; code: MissingTopicFailure };

async function findPending(prisma: PrismaClient, topicId: string) {
  const item = await prisma.queueItem.findUnique({
    where: { id: topicId },
    select: {
      id: true,
      title: true,
      missingSince: true,
      missingAck: true,
      runs: { select: { status: true } },
    },
  });
  if (!item) return { ok: false as const, code: 'TOPIC_NOT_FOUND' as const };
  if (item.missingSince === null || item.missingAck !== null) {
    return { ok: false as const, code: 'NOT_MISSING' as const };
  }
  return { ok: true as const, item };
}

/**
 * "보류로 옮기기" — `주제_큐.md`의 `## 보류` 끝에 **사라지기 직전 줄 원문 그대로** 덧붙이고
 * 재적재한다. 제목에서 줄을 다시 만들지 않는다(괄호 힌트가 사라진다).
 *
 * 파일에 되살리는 이유: 쓰지 않으면 보류가 두 종류가 된다 — 사용자가 직접 옮긴 보류는 파일에,
 * 대시보드가 옮긴 보류는 DB에만. **큐 파일은 대시보드 없이도 그 자체로 읽혀야 한다.**
 *
 * **완료 Run이 있는 항목은 되살리지 않는다**(`TOPIC_DONE`). 보류는 "앞으로 할지도 모르는 일"이라
 * 파일에 보이는 게 쓸모 있지만, 완료는 끝난 일이고 사용자가 직접 치운 것이다.
 *
 * 쓰기 직전에 파일을 다시 읽어 최신 내용 위에 덧붙인다(그새 바뀌었을 수 있다).
 * 되살린 줄은 다음 파싱에서 매칭되므로 `missingSince`·`missingAck`는 저절로 비워진다.
 */
export async function restoreMissingTopicToHold(
  deps: { storage: Storage; prisma: PrismaClient },
  topicId: string,
): Promise<MissingTopicResult> {
  const found = await findPending(deps.prisma, topicId);
  if (!found.ok) return found;
  const { item } = found;

  if (item.runs.some((run) => run.status === RUN_STATUS.done)) {
    return { ok: false, code: 'TOPIC_DONE' };
  }

  const parsed = parseQueue(await deps.storage.readQueueFile());
  const restored = {
    preamble: parsed.preamble,
    sections: { ...parsed.sections, 보류: [...parsed.sections.보류, { title: item.title }] },
  };

  await deps.storage.writeQueueFile(serializeQueue(restored));
  await importQueueFromFile(deps);
  return { ok: true };
}

/** "그대로 두기" — 파일은 건드리지 않고 다시 묻지만 않는다. */
export async function acknowledgeMissingTopic(
  prisma: PrismaClient,
  topicId: string,
  now: Date = new Date(),
): Promise<MissingTopicResult> {
  const found = await findPending(prisma, topicId);
  if (!found.ok) return found;

  await prisma.queueItem.update({ where: { id: topicId }, data: { missingAck: now } });
  return { ok: true };
}
