// 큐 섹션 안 순서 변경(서버 전용): pipeline이 주제_큐.md를 재작성하고 DB를 다시 적재한다.
// 실패는 던지지 않고 { ok: false, error } 형태로 — 화면이 문구를 그린다(queue-move와 같은 규약).
import {
  LocalFsStorage,
  prisma,
  reorderQueueTopic,
  type ReorderQueueFailure,
  type ReorderQueueTopicInput,
} from '@galley/pipeline';

export type QueueReorderErrorCode =
  'BLOG_DIR_MISSING' | ReorderQueueFailure | 'QUEUE_REORDER_FAILED';

export type QueueReorderResult =
  { ok: true } | { ok: false; error: { code: QueueReorderErrorCode; message: string } };

const FAILURE_MESSAGE: Record<ReorderQueueFailure, string> = {
  TOPIC_MISMATCH: '주제_큐.md가 그새 바뀌었습니다. 다시 불러온 뒤 시도해 주세요.',
  INVALID_POSITION: '옮길 수 없는 위치입니다.',
  UNSUPPORTED_SECTION: '후보는 카테고리 소제목이 있어 순서를 바꿀 수 없습니다.',
};

export async function reorderQueueRow(input: ReorderQueueTopicInput): Promise<QueueReorderResult> {
  const blogDir = process.env.BLOG_DIR;
  if (!blogDir) {
    return {
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '루트 .env에 BLOG_DIR이 없습니다.' },
    };
  }

  try {
    const result = await reorderQueueTopic({ storage: new LocalFsStorage(blogDir), prisma }, input);
    if (result.ok) return { ok: true };
    return { ok: false, error: { code: result.code, message: FAILURE_MESSAGE[result.code] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'QUEUE_REORDER_FAILED', message: `순서를 바꾸지 못했습니다: ${reason}` },
    };
  }
}
