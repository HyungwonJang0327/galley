// 큐 섹션 이동(대기↔후보↔보류) → 주제_큐.md 재작성 → DB 재적재.
// 파일이 진실(SoT)이므로 DB만 바꾸지 않는다 — decisions/queue-sync-direction.md.
import type { PrismaClient } from '@prisma/client';
import type { Storage } from '../storage/Storage.ts';
import { importQueueFromFile } from './importQueue.ts';
import { parseQueue, serializeQueue, type ParsedQueue, type QueueStatus } from './queueFile.ts';

/** 이동할 수 있는 섹션. 완료는 발행까지 끝난 기록이라 이동 대상이 아니다(완료일이 사라진다). */
export const MOVABLE_STATUSES = ['대기', '후보', '보류'] as const;
export type MovableStatus = (typeof MOVABLE_STATUSES)[number];

export interface MoveQueueTopicInput {
  /** 지금 섹션. */
  from: QueueStatus;
  /** 옮길 섹션. */
  to: MovableStatus;
  /** from 섹션 안에서의 0기반 위치(카테고리 필터 전 기준). */
  index: number;
  /** 그 위치에 있어야 할 제목. 다르면 파일이 그새 바뀐 것으로 보고 옮기지 않는다. */
  title: string;
}

export type MoveQueueFailure =
  /** from/to가 같거나 완료가 끼어 있음 */
  | 'INVALID_SECTION'
  /** index·title이 파일과 다름(그새 파일이 바뀜) */
  | 'TOPIC_MISMATCH';

export type MoveQueueResult = { ok: true } | { ok: false; code: MoveQueueFailure };

function isMovable(status: QueueStatus): status is MovableStatus {
  return (MOVABLE_STATUSES as readonly QueueStatus[]).includes(status);
}

/**
 * 옮긴 큐를 새로 만든다(입력 불변). 옮길 수 없으면 실패 코드.
 * 대기·보류는 맨 아래(사용자 결정 2026-09-12 — 기존 순서·"다음 실행"을 밀지 않는다).
 * 후보는 카테고리 없는 구간(첫 ### 앞)의 끝 — 맨 아래에 넣으면 마지막 소제목 카테고리가 붙는다.
 */
export function moveTopic(
  queue: ParsedQueue,
  input: MoveQueueTopicInput,
): { ok: true; queue: ParsedQueue } | { ok: false; code: MoveQueueFailure } {
  const { from, to, index, title } = input;
  if (from === to || !isMovable(from) || !isMovable(to))
    return { ok: false, code: 'INVALID_SECTION' };

  const source = queue.sections[from];
  const topic = source[index];
  if (!topic || topic.title !== title) return { ok: false, code: 'TOPIC_MISMATCH' };

  const sections = { ...queue.sections };
  sections[from] = source.filter((_, i) => i !== index);
  // 카테고리는 후보 섹션의 ### 소제목이라 섹션을 옮기면 유지할 수 없다(파일 형식).
  const moved = { title: topic.title };
  const target = [...sections[to]];
  const at = to === '후보' ? target.findIndex((item) => item.category !== undefined) : -1;
  if (at === -1) target.push(moved);
  else target.splice(at, 0, moved);
  sections[to] = target;

  return { ok: true, queue: { preamble: queue.preamble, sections } };
}

/**
 * 파일을 다시 읽어(쓰기 직전 최신 상태) 옮기고, 재작성한 뒤 DB를 파일 기준으로 다시 적재한다.
 * 실패하면 파일·DB 어느 쪽도 건드리지 않는다.
 */
export async function moveQueueTopic(
  deps: { storage: Storage; prisma: PrismaClient },
  input: MoveQueueTopicInput,
): Promise<MoveQueueResult> {
  const parsed = parseQueue(await deps.storage.readQueueFile());
  const result = moveTopic(parsed, input);
  if (!result.ok) return result;

  await deps.storage.writeQueueFile(serializeQueue(result.queue));
  await importQueueFromFile(deps);
  return { ok: true };
}
