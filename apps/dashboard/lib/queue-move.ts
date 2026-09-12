// 큐 섹션 이동(서버 전용): pipeline이 주제_큐.md를 재작성하고 DB를 다시 적재한다.
// 실패는 던지지 않고 { ok: false, error } 형태로 돌려준다 — 화면이 문구를 그린다.
import {
  LocalFsStorage,
  moveQueueTopic,
  prisma,
  type MoveQueueTopicInput,
  type MoveQueueFailure,
} from '@galley/pipeline';

export type QueueMoveErrorCode = 'BLOG_DIR_MISSING' | MoveQueueFailure | 'QUEUE_MOVE_FAILED';

export type QueueMoveResult =
  { ok: true } | { ok: false; error: { code: QueueMoveErrorCode; message: string } };

const FAILURE_MESSAGE: Record<MoveQueueFailure, string> = {
  TOPIC_MISMATCH: '주제_큐.md가 그새 바뀌었습니다. 다시 불러온 뒤 시도해 주세요.',
  INVALID_SECTION: '옮길 수 없는 섹션입니다.',
};

export async function moveQueueRow(input: MoveQueueTopicInput): Promise<QueueMoveResult> {
  const blogDir = process.env.BLOG_DIR;
  if (!blogDir) {
    return {
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '루트 .env에 BLOG_DIR이 없습니다.' },
    };
  }

  try {
    const result = await moveQueueTopic({ storage: new LocalFsStorage(blogDir), prisma }, input);
    if (result.ok) return { ok: true };
    return { ok: false, error: { code: result.code, message: FAILURE_MESSAGE[result.code] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'QUEUE_MOVE_FAILED', message: `옮기지 못했습니다: ${reason}` },
    };
  }
}
