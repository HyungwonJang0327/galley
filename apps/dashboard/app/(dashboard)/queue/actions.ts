'use server';
// 큐 화면 헤더 "파일에서 다시 불러오기"(decisions/queue-sync-direction.md 수동 갱신 버튼).
// 적재 뒤 레이아웃 전체를 다시 그려 큐 목록·(앞으로) 사이드바 배지·홈이 같은 파일 상태를 보게 한다.
import { revalidatePath } from 'next/cache';
import type { MoveQueueTopicInput, ReorderQueueTopicInput } from '@galley/pipeline';
import { moveQueueRow, type QueueMoveResult } from '../../../lib/queue-move';
import { reloadQueue, type QueueReloadResult } from '../../../lib/queue-reload';
import {
  keepMissingTopic,
  moveMissingTopicToHold,
  type MissingResolveResult,
} from '../../../lib/queue-missing';
import { reorderQueueRow, type QueueReorderResult } from '../../../lib/queue-reorder';

export async function reloadQueueAction(): Promise<QueueReloadResult> {
  const result = await reloadQueue();
  revalidatePath('/', 'layout');
  return result;
}

/** 행 ⋮ 메뉴의 섹션 이동. 성공했을 때만 다시 그린다(실패는 아무것도 바뀌지 않음). */
export async function moveQueueRowAction(input: MoveQueueTopicInput): Promise<QueueMoveResult> {
  const result = await moveQueueRow(input);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * 파일에서 사라진 주제를 보류로 옮긴다 — `주제_큐.md`의 `## 보류`에 줄을 되살린다.
 * 파일이 바뀌므로 레이아웃 전체를 다시 그린다(배지·홈 타일도 같은 소스를 본다).
 */
export async function moveMissingTopicToHoldAction(topicId: string): Promise<MissingResolveResult> {
  const result = await moveMissingTopicToHold(topicId);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** 파일에서 사라진 주제를 그대로 둔다(다시 묻지 않기). 파일은 건드리지 않는다. */
export async function keepMissingTopicAction(topicId: string): Promise<MissingResolveResult> {
  const result = await keepMissingTopic(topicId);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** 대기 탭 드래그 순서 변경(놓자마자 저장 — 사용자 결정 2026-09-12). */
export async function reorderQueueRowAction(
  input: ReorderQueueTopicInput,
): Promise<QueueReorderResult> {
  const result = await reorderQueueRow(input);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
