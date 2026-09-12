// POST /api/runs — 주제 하나를 실행 큐에 올린다(Run을 queued로 생성). 워커가 집어가 실행한다.
// 응답 형태는 CLAUDE.md §4: 성공 { ok: true, data } / 실패 { ok: false, error: { code, message } }.
// 재실행·승인은 Run 상태 전이(상태 머신 B1a)가 필요해 아직 여기에 없다 — decisions/run-location.md.
import { startRunForTopic, type RunStartErrorCode } from '../../../lib/run-start';

type ErrorCode = RunStartErrorCode | 'INVALID_BODY';

/** 코드 → HTTP 상태. 입력 문제는 400, 없는 주제는 404, 이미 도는 주제는 409, 그 밖은 500. */
const STATUS: Record<ErrorCode, number> = {
  INVALID_BODY: 400,
  TOPIC_NOT_FOUND: 404,
  EMPTY_TITLE: 400,
  UNKNOWN_MODEL: 400,
  MODEL_UNAVAILABLE: 400,
  RUN_ALREADY_ACTIVE: 409,
  RUN_START_FAILED: 500,
};

function fail(code: ErrorCode, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status: STATUS[code] });
}

interface StartRunBody {
  /** 주제 키 = QueueItem.id. 제목이 아니라 id로 받는다 — 제목은 바뀔 수 있다. */
  topicId: string;
  modelId?: string;
}

/** 본문 검증은 여기서만 한다(pipeline은 이미 타입이 맞는 입력을 받는다). */
function parseBody(body: unknown): StartRunBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const { topicId, modelId } = body as Record<string, unknown>;
  if (typeof topicId !== 'string' || topicId === '') return null;
  if (modelId !== undefined && typeof modelId !== 'string') return null;
  return modelId === undefined ? { topicId } : { topicId, modelId };
}

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('INVALID_BODY', 'JSON 본문이 필요합니다.');
  }

  const input = parseBody(raw);
  if (!input) return fail('INVALID_BODY', 'topicId(문자열)가 필요합니다. modelId는 선택입니다.');

  const result = await startRunForTopic(input);
  if (!result.ok) return fail(result.error.code, result.error.message);

  return Response.json({ ok: true, data: result.data }, { status: 201 });
}
