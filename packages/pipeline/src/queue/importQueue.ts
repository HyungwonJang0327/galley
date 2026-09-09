// 주제_큐.md → SQLite 적재. 파일이 진실(SoT)이므로 로드 시 전체 리셋으로
// DB를 파일 상태로 통째 교체한다. (decisions/queue-sync-direction.md 적재 전략)
import type { PrismaClient } from '@prisma/client';
import { parseQueue, type ParsedQueue, type QueueStatus } from './queueFile';
import type { Storage } from '../storage/Storage';

const STATUS_ORDER: QueueStatus[] = ['대기', '후보', '보류', '완료'];

/** DB에 넣을 QueueItem 행. id·createdAt·updatedAt은 스키마 기본값이 채운다. */
export interface QueueItemRow {
  title: string;
  status: QueueStatus;
  order: number;
  category: string | null;
  completedOn: string | null;
}

/** ParsedQueue를 QueueItem 행 배열로 변환한다(순수). order는 섹션 내 0기반. */
export function parsedQueueToRows(parsed: ParsedQueue): QueueItemRow[] {
  const rows: QueueItemRow[] = [];
  for (const status of STATUS_ORDER) {
    parsed.sections[status].forEach((topic, order) => {
      rows.push({
        title: topic.title,
        status,
        order,
        category: topic.category ?? null,
        completedOn: topic.completedOn ?? null,
      });
    });
  }
  return rows;
}

/**
 * 주제_큐.md를 읽어 DB에 재적재한다(전체 리셋). 트랜잭션 안에서 기존 행을 모두
 * 지운 뒤 파일에서 파생한 행으로 다시 채운다 → DB가 파일 상태와 항상 일치.
 */
export async function importQueueFromFile(deps: {
  storage: Storage;
  prisma: PrismaClient;
}): Promise<void> {
  const raw = await deps.storage.readQueueFile();
  const rows = parsedQueueToRows(parseQueue(raw));
  await deps.prisma.$transaction([
    deps.prisma.queueItem.deleteMany(),
    deps.prisma.queueItem.createMany({ data: rows }),
  ]);
}
