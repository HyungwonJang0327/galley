// 큐 화면 데이터(서버 전용). BLOG_DIR의 주제_큐.md를 DB에 재적재한 뒤 섹션별로 읽는다.
// 실패는 던지지 않고 { ok: false, error } 형태로 돌려준다 — 화면이 안내 문구를 그린다.
import 'server-only';
import {
  LocalFsStorage,
  loadQueueSections,
  loadQueueSeries,
  prisma,
  type QueueSections,
  type QueueSeriesSummary,
} from '@galley/pipeline';

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

/**
 * 시리즈 정의 요약(배지 툴팁·후보 그룹 헤더용). 장식이라 실패해도 목록을 막지 않는다 — 빈 배열이면 배지만 남고
 * 툴팁·헤더가 빠질 뿐. 섹션 로드가 성공한 뒤에 부른다(같은 파일을 한 번 더 읽는다).
 */
export async function getQueueSeries(): Promise<QueueSeriesSummary[]> {
  const blogDir = process.env.BLOG_DIR;
  if (!blogDir) return [];
  try {
    return await loadQueueSeries({ storage: new LocalFsStorage(blogDir) });
  } catch {
    return [];
  }
}
