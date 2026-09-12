// 실행 시작(서버 전용): pipeline이 Run을 queued로 만들고, 실제 실행은 워커가 집어간다
// — decisions/run-location.md. 실패는 던지지 않고 { ok: false, error } 형태로 돌려준다.
import {
  createModelRegistryFromEnv,
  prisma,
  startRun,
  type StartRunFailure,
} from '@galley/pipeline';

export type RunStartErrorCode = StartRunFailure | 'RUN_START_FAILED';

/** 화면·API가 그대로 쓰는 직렬화 형태(Date는 ISO 문자열). */
export interface StartedRun {
  id: string;
  topicSlug: string;
  topicTitle: string;
  status: string;
  modelId: string;
  startedAt: string;
}

export type RunStartResult =
  | { ok: true; data: StartedRun }
  | { ok: false; error: { code: RunStartErrorCode; message: string } };

const FAILURE_MESSAGE: Record<StartRunFailure, string> = {
  EMPTY_TITLE: '주제 제목이 비어 있습니다.',
  UNKNOWN_MODEL: '등록되지 않은 모델입니다.',
  MODEL_UNAVAILABLE: '이 모델의 API 키가 .env에 없습니다.',
  RUN_ALREADY_ACTIVE: '이 주제는 아직 끝나지 않은 실행이 있습니다.',
};

export async function startRunForTopic(input: {
  title: string;
  modelId?: string;
}): Promise<RunStartResult> {
  try {
    const registry = createModelRegistryFromEnv(process.env);
    const result = await startRun({ prisma, registry }, input);
    if (!result.ok) {
      return { ok: false, error: { code: result.code, message: FAILURE_MESSAGE[result.code] } };
    }
    const { run } = result;
    return {
      ok: true,
      data: {
        id: run.id,
        topicSlug: run.topicSlug,
        topicTitle: run.topicTitle,
        status: run.status,
        modelId: run.modelId,
        startedAt: run.startedAt.toISOString(),
      },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'RUN_START_FAILED', message: `실행을 시작하지 못했습니다: ${reason}` },
    };
  }
}
