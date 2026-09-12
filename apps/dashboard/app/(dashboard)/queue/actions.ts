'use server';
// 큐 화면 헤더 "파일에서 다시 불러오기"(decisions/queue-sync-direction.md 수동 갱신 버튼).
// 적재 뒤 레이아웃 전체를 다시 그려 큐 목록·(앞으로) 사이드바 배지·홈이 같은 파일 상태를 보게 한다.
import { revalidatePath } from 'next/cache';
import type { MoveQueueTopicInput } from '@galley/pipeline';
import { moveQueueRow, type QueueMoveResult } from '../../../lib/queue-move';
import { reloadQueue, type QueueReloadResult } from '../../../lib/queue-reload';

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
