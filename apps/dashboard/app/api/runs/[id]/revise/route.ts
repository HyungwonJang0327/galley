// POST /api/runs/[id]/revise — 승인 대기 실행에 수정 지시. 이 실행은 revised로 끝나고
// 새 실행이 시작 단계부터 queued로 생긴다(워커가 집어간다). 본문 { instruction, startStep?, modelId? }.
import { reviseRunById } from '../../../../../lib/run-commands';
import { RERUN_BODY_HINT, fail, ok, parseRerunBody, readJson, type RouteContext } from '../_shared';

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  const json = await readJson(request);
  if (!json.ok) return fail('INVALID_BODY', 'JSON 본문이 필요합니다.');
  const body = parseRerunBody(json.raw, true);
  if (!body) return fail('INVALID_BODY', RERUN_BODY_HINT);

  const result = await reviseRunById({ runId: id, ...body });
  if (!result.ok) return fail(result.error.code, result.error.message);
  return ok(result.data, 201);
}
