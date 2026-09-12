// 파일에서 사라진 항목 확인(서버 전용). 목록 조회와 두 가지 답(보류로 옮기기 / 그대로 두기).
// 실패는 던지지 않고 { ok: false, error } 형태로 — decisions/error-handling.md.
import {
  LocalFsStorage,
  acknowledgeMissingTopic,
  listMissingTopics,
  prisma,
  restoreMissingTopicToHold,
  type MissingTopicFailure,
} from '@galley/pipeline';

export type MissingErrorCode =
  MissingTopicFailure | 'BLOG_DIR_MISSING' | 'MISSING_LOAD_FAILED' | 'MISSING_RESOLVE_FAILED';

/** 화면이 그대로 그리는 형태(Date는 ISO 문자열). */
export interface MissingTopicView {
  id: string;
  title: string;
  missingSince: string;
  runCount: number;
}

export type MissingListResult =
  | { ok: true; data: MissingTopicView[] }
  | { ok: false; error: { code: MissingErrorCode; message: string } };

export type MissingResolveResult =
  { ok: true } | { ok: false; error: { code: MissingErrorCode; message: string } };

const FAILURE_MESSAGE: Record<MissingTopicFailure, string> = {
  TOPIC_NOT_FOUND: '큐에 없는 주제입니다.',
  NOT_MISSING: '그새 상태가 바뀌었습니다. 새로고침한 뒤 다시 시도해 주세요.',
  TOPIC_DONE: '발행까지 끝난 주제라 큐 파일에 되살리지 않습니다. 완료로 남습니다.',
};

/** 셸·큐 화면이 부르므로 **던지지 않는다** — 한 곳이 실패하면 화면 전체가 죽는다. */
export async function getMissingTopics(): Promise<MissingListResult> {
  try {
    const topics = await listMissingTopics(prisma);
    return {
      ok: true,
      data: topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
        missingSince: topic.missingSince.toISOString(),
        runCount: topic.runCount,
      })),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: {
        code: 'MISSING_LOAD_FAILED',
        message: `확인 대기 항목을 읽지 못했습니다: ${reason}`,
      },
    };
  }
}

/** "보류로 옮기기" — 주제_큐.md에 줄을 되살리므로 BLOG_DIR이 필요하다. */
export async function moveMissingTopicToHold(topicId: string): Promise<MissingResolveResult> {
  const blogDir = process.env.BLOG_DIR;
  if (!blogDir) {
    return {
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '루트 .env에 BLOG_DIR이 없습니다.' },
    };
  }

  try {
    const result = await restoreMissingTopicToHold(
      { storage: new LocalFsStorage(blogDir), prisma },
      topicId,
    );
    if (result.ok) return { ok: true };
    return { ok: false, error: { code: result.code, message: FAILURE_MESSAGE[result.code] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'MISSING_RESOLVE_FAILED', message: `옮기지 못했습니다: ${reason}` },
    };
  }
}

/** "그대로 두기" — 파일을 건드리지 않으므로 BLOG_DIR이 없어도 된다. */
export async function keepMissingTopic(topicId: string): Promise<MissingResolveResult> {
  try {
    const result = await acknowledgeMissingTopic(prisma, topicId);
    if (result.ok) return { ok: true };
    return { ok: false, error: { code: result.code, message: FAILURE_MESSAGE[result.code] } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'MISSING_RESOLVE_FAILED', message: `처리하지 못했습니다: ${reason}` },
    };
  }
}
