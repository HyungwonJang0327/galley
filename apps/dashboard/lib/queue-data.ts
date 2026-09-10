// 큐 화면 데이터(서버 전용). BLOG_DIR의 주제_큐.md를 DB에 재적재한 뒤 섹션별로 읽는다.
// 실패는 던지지 않고 { ok: false, error } 형태로 돌려준다 — 화면이 안내 문구를 그린다.
import { LocalFsStorage, loadQueueSections, prisma, type QueueSections } from '@galley/pipeline';

export type QueueLoadResult =
  | { ok: true; data: QueueSections }
  | { ok: false; error: { code: 'BLOG_DIR_MISSING' | 'QUEUE_LOAD_FAILED'; message: string } };

export async function getQueueSections(): Promise<QueueLoadResult> {
  const blogDir = process.env.BLOG_DIR;
  if (!blogDir) {
    return {
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '루트 .env에 BLOG_DIR이 없습니다.' },
    };
  }

  try {
    const data = await loadQueueSections({ storage: new LocalFsStorage(blogDir), prisma });
    return { ok: true, data };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'QUEUE_LOAD_FAILED', message: `주제_큐.md를 불러오지 못했습니다: ${reason}` },
    };
  }
}
