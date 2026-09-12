// 섹션 안 순서 변경(대기 탭 DnD) → 주제_큐.md 재작성 → DB 재적재.
// 섹션 간 이동은 moveQueue.ts. 여기서는 같은 섹션 안에서 위치만 바꾼다.
import type { PrismaClient } from '@prisma/client';
import type { Storage } from '../storage/Storage.ts';
import { importQueueFromFile } from './importQueue.ts';
import { parseQueue, serializeQueue, type ParsedQueue, type QueueStatus } from './queueFile.ts';

export interface ReorderQueueTopicInput {
  /** 순서를 바꿀 섹션. */
  status: QueueStatus;
  /** 지금 위치(0기반, 카테고리 필터 전 기준). */
  from: number;
  /** 옮길 위치(0기반). 제거 후 기준이 아니라 "그 자리에 놓는다". */
  to: number;
  /** from 위치에 있어야 할 제목. 다르면 파일이 그새 바뀐 것으로 보고 바꾸지 않는다. */
  title: string;
}

export type ReorderQueueFailure =
  /** from·to가 섹션 범위 밖이거나 같은 자리 */
  | 'INVALID_POSITION'
  /** from 위치의 제목이 다름(그새 파일이 바뀜) */
  | 'TOPIC_MISMATCH'
  /** 후보 섹션(### 소제목이 있어 줄 순서만 바꾸면 카테고리가 달라진다) */
  | 'UNSUPPORTED_SECTION';

export type ReorderQueueResult = { ok: true } | { ok: false; code: ReorderQueueFailure };

/**
 * 순서를 바꾼 큐를 새로 만든다(입력 불변). 카테고리·완료일 등 항목 내용은 그대로 옮긴다
 * — 같은 섹션 안이라 후보의 ### 소제목도 유지된다.
 */
export function reorderTopic(
  queue: ParsedQueue,
  input: ReorderQueueTopicInput,
): { ok: true; queue: ParsedQueue } | { ok: false; code: ReorderQueueFailure } {
  const { status, from, to, title } = input;
  const source = queue.sections[status];

  // 후보는 카테고리가 ### 소제목으로 표현된다 — 줄 순서만 바꾸면 무카테고리 항목이 직전 소제목
  // 아래로 들어가 없던 카테고리가 생긴다(파일 형식). 순서 변경은 대기 탭만(사용자 결정 2026-09-12).
  if (status === '후보') return { ok: false, code: 'UNSUPPORTED_SECTION' };
  if (from === to) return { ok: false, code: 'INVALID_POSITION' };
  if (from < 0 || from >= source.length || to < 0 || to >= source.length) {
    return { ok: false, code: 'INVALID_POSITION' };
  }

  const topic = source[from];
  if (!topic || topic.title !== title) return { ok: false, code: 'TOPIC_MISMATCH' };

  const next = source.filter((_, i) => i !== from);
  next.splice(to, 0, topic);

  return {
    ok: true,
    queue: { preamble: queue.preamble, sections: { ...queue.sections, [status]: next } },
  };
}

/**
 * 파일을 다시 읽어(쓰기 직전 최신 상태) 순서를 바꾸고, 재작성한 뒤 DB를 파일 기준으로 다시 적재한다.
 * 실패하면 파일·DB 어느 쪽도 건드리지 않는다.
 */
export async function reorderQueueTopic(
  deps: { storage: Storage; prisma: PrismaClient },
  input: ReorderQueueTopicInput,
): Promise<ReorderQueueResult> {
  const parsed = parseQueue(await deps.storage.readQueueFile());
  const result = reorderTopic(parsed, input);
  if (!result.ok) return result;

  await deps.storage.writeQueueFile(serializeQueue(result.queue));
  await importQueueFromFile(deps);
  return { ok: true };
}
