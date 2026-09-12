// /api/runs/[id]/* 세 핸들러가 같이 쓰는 것 — 응답 봉투, 본문 파싱, 코드→HTTP 상태.
// 상태 표는 decisions/error-handling.md "HTTP 상태 매핑": 형식 400 · 없음 404 · 상태 충돌 409 · 그 밖 500.
import { INSTRUCTION_MAX_LENGTH, isStepName, type StepName } from '@galley/pipeline';

/** Next 16 동적 라우트 — `params`는 Promise다. */
export type RouteContext = { params: Promise<{ id: string }> };

export const STATUS_OF: Record<string, number> = {
  INVALID_BODY: 400,
  INSTRUCTION_TOO_LONG: 400,
  UNKNOWN_MODEL: 400,
  MODEL_UNAVAILABLE: 400,
  RUN_NOT_FOUND: 404,
  NOT_PENDING_APPROVAL: 409,
  NOT_LATEST_ATTEMPT: 409,
  CARRIED_STEP_NOT_SUCCEEDED: 409,
};

export function fail(code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status: STATUS_OF[code] ?? 500 });
}

export function ok(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

export interface RerunBody {
  instruction: string;
  startStep?: StepName;
  modelId?: string;
}

export const RERUN_BODY_HINT = `instruction(문자열, ${INSTRUCTION_MAX_LENGTH}자 이하)이 필요합니다. startStep(단계 이름)·modelId는 선택입니다.`;

/**
 * 수정 지시·미리보기 본문. 형식만 본다(길이 상한은 pipeline이 같은 상수로 거절한다 — 여기서
 * 한 번 더 자르지 않아 두 층의 답이 어긋나지 않게).
 */
export function parseRerunBody(raw: unknown, allowModel: boolean): RerunBody | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { instruction, startStep, modelId } = raw as Record<string, unknown>;
  if (typeof instruction !== 'string') return null;
  if (startStep !== undefined && (typeof startStep !== 'string' || !isStepName(startStep))) {
    return null;
  }
  if (modelId !== undefined && (!allowModel || typeof modelId !== 'string')) return null;

  const body: RerunBody = { instruction };
  if (startStep !== undefined) body.startStep = startStep;
  if (modelId !== undefined) body.modelId = modelId;
  return body;
}

export async function readJson(
  request: Request,
): Promise<{ ok: true; raw: unknown } | { ok: false }> {
  try {
    return { ok: true, raw: await request.json() };
  } catch {
    return { ok: false };
  }
}
