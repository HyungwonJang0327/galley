// POST /api/runs/[id]/answer — 승인 대기 실행의 확인 질문에 답(decisions/review-questions.md). 이 실행은 revised로 끝나고
// 답한 곳만 고치는 새 실행이 queued로 생긴다(워커가 집어간다). 본문 { answers: [{ id, kind, text? }] } — 답한 질문만.
import { answerRunById } from '../../../../../lib/run-commands';
import {
  ANSWER_BODY_HINT,
  fail,
  ok,
  parseAnswerBody,
  readJson,
  type RouteContext,
} from '../_shared';

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  const json = await readJson(request);
  if (!json.ok) return fail('INVALID_BODY', 'JSON 본문이 필요합니다.');
  const answers = parseAnswerBody(json.raw);
  if (!answers) return fail('INVALID_BODY', ANSWER_BODY_HINT);

  const result = await answerRunById({ runId: id, answers });
  if (!result.ok) return fail(result.error.code, result.error.message);
  return ok(result.data, 201);
}
