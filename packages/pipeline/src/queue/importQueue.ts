// 주제_큐.md → SQLite 적재. 파일이 진실(SoT)이지만 **전체 리셋은 하지 않는다** —
// QueueItem.id가 Run의 주제 키라 id가 바뀌면 실행 이력이 끊긴다.
// 정규화 제목으로 기존 항목을 찾아 갱신하고, 못 찾은 줄만 새로 만든다.
// 파일에서 사라진 줄은 지우지 않는다. (decisions/queue-sync-direction.md)
import type { PrismaClient } from '@prisma/client';
import { parseQueue, type ParsedQueue, type QueueStatus } from './queueFile';
import { normalizeTopicTitle } from './normalizeTitle';
import { RUN_STATUS } from '../run/stateMachine';
import type { Storage } from '../storage/Storage';

const STATUS_ORDER: QueueStatus[] = ['대기', '후보', '보류', '완료'];

/** 파일에서 사라져 자동으로 내린 항목의 보류 사유. 보류 탭이 `manual`과 구분해 보여준다. */
export const HOLD_REASON_REMOVED = 'removed-from-file';

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

/** 파일에서 사라진 항목을 어떻게 할지. 셋 다 **삭제는 하지 않는다**. */
export type MissingDisposition =
  /** 완료 Run이 있다 — 파일 유무로 확정된 상태를 뒤집지 않는다. 그대로 둔다. */
  | 'keep-done'
  /** Run이 붙어 있다 — 제목 수정이 "삭제 + 추가"로 보일 수 있어 확인을 받는다. 표시만 한다. */
  | 'await-confirm'
  /** Run이 없다 — 잃을 것이 없으니 조용히 보류로. */
  | 'hold';

interface ExistingItem {
  id: string;
  title: string;
  missingSince: Date | null;
  runs: { status: string }[];
}

/** 파일에서 사라진 항목 하나를 어떻게 할지 고른다(순수). */
export function disposeMissing(item: { runs: { status: string }[] }): MissingDisposition {
  if (item.runs.some((run) => run.status === RUN_STATUS.done)) return 'keep-done';
  return item.runs.length > 0 ? 'await-confirm' : 'hold';
}

/**
 * 정규화 제목 → 아직 매칭되지 않은 기존 항목들. 같은 정규화 제목이 여럿이면 먼저 만든 것부터
 * 하나씩 꺼내 쓴다(줄 순서가 바뀌어도 같은 항목끼리 짝이 맞는다).
 */
function indexByTitle(items: readonly ExistingItem[]): Map<string, ExistingItem[]> {
  const index = new Map<string, ExistingItem[]>();
  for (const item of items) {
    const key = normalizeTopicTitle(item.title);
    const bucket = index.get(key);
    if (bucket) bucket.push(item);
    else index.set(key, [item]);
  }
  return index;
}

/**
 * 주제_큐.md를 읽어 DB에 반영한다. 매칭된 줄은 갱신, 없는 줄은 생성, 사라진 줄은
 * `disposeMissing`이 정한 대로 — 어느 경우에도 행을 지우지 않는다.
 */
export async function importQueueFromFile(deps: {
  storage: Storage;
  prisma: PrismaClient;
}): Promise<void> {
  const rows = parsedQueueToRows(parseQueue(await deps.storage.readQueueFile()));
  const existing: ExistingItem[] = await deps.prisma.queueItem.findMany({
    select: { id: true, title: true, missingSince: true, runs: { select: { status: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const byTitle = indexByTitle(existing);
  const matched = new Set<string>();
  const updates: { id: string; row: QueueItemRow }[] = [];
  const creates: QueueItemRow[] = [];

  for (const row of rows) {
    const bucket = byTitle.get(normalizeTopicTitle(row.title));
    const item = bucket?.shift();
    if (item) {
      matched.add(item.id);
      updates.push({ id: item.id, row });
    } else {
      creates.push(row);
    }
  }

  // 사라진 줄이 보류로 갈 자리 — 파일의 보류 줄 뒤에 붙인다(파일 순서를 밀지 않는다).
  let holdOrder = rows.filter((row) => row.status === '보류').length;
  const now = new Date();

  await deps.prisma.$transaction(async (tx) => {
    for (const { id, row } of updates) {
      // 줄이 돌아왔으니 사라짐 표시·확인 기록·자동 보류 사유를 지운다.
      await tx.queueItem.update({
        where: { id },
        data: { ...row, missingSince: null, missingAck: null, holdReason: null },
      });
    }
    if (creates.length > 0) await tx.queueItem.createMany({ data: creates });

    for (const item of existing) {
      if (matched.has(item.id)) continue;
      const disposition = disposeMissing(item);
      if (disposition === 'keep-done') continue;
      if (disposition === 'await-confirm') {
        // 이미 표시돼 있으면 시각을 덮지 않는다 — "언제부터 사라졌는지"를 보존한다.
        if (item.missingSince === null) {
          await tx.queueItem.update({ where: { id: item.id }, data: { missingSince: now } });
        }
        continue;
      }
      // 확인 없이 내린 것이므로 missingSince(= 확인 대기 표시)는 남기지 않는다.
      // 왜 보류가 됐는지는 holdReason이 말한다.
      await tx.queueItem.update({
        where: { id: item.id },
        data: {
          status: '보류',
          order: holdOrder++,
          category: null,
          completedOn: null,
          holdReason: HOLD_REASON_REMOVED,
          missingSince: null,
        },
      });
    }
  });
}
