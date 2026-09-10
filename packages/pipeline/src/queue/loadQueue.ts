// 큐 화면용 로드: 파일(SoT)을 DB에 재적재한 뒤 DB에서 섹션별로 읽는다.
// decisions/queue-sync-direction.md "로드 시 파일을 다시 읽어 DB 갱신".
import type { PrismaClient } from '@prisma/client';
import type { Storage } from '../storage/Storage';
import { importQueueFromFile } from './importQueue';
import type { QueueStatus } from './queueFile';

/** 화면에 보여 줄 주제 한 줄. */
export interface QueueEntry {
  title: string;
  category: string | null;
  completedOn: string | null;
}

export type QueueSections = Record<QueueStatus, QueueEntry[]>;

const STATUSES: readonly string[] = ['대기', '후보', '보류', '완료'];

function isQueueStatus(value: string): value is QueueStatus {
  return STATUSES.includes(value);
}

export async function loadQueueSections(deps: {
  storage: Storage;
  prisma: PrismaClient;
}): Promise<QueueSections> {
  await importQueueFromFile(deps);
  const items = await deps.prisma.queueItem.findMany({
    orderBy: { order: 'asc' },
    select: { title: true, status: true, category: true, completedOn: true },
  });

  const sections: QueueSections = { 대기: [], 후보: [], 보류: [], 완료: [] };
  for (const { status, title, category, completedOn } of items) {
    // status는 DB에서 문자열(스키마에 enum 없음). 방금 파일에서 적재했으므로 네 값뿐이다.
    if (isQueueStatus(status)) sections[status].push({ title, category, completedOn });
  }
  return sections;
}
