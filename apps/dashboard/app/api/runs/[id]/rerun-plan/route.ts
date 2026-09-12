// POST /api/runs/[id]/rerun-plan — 재실행 확인 Dialog용 미리보기. 부작용은 없지만 수정 지시가
// 길면(상한 2000자, 한글은 URL 인코딩 시 9배) 쿼리에 못 실어 GET 대신 POST 본문으로 받는다.
// 본문 { instruction, startStep? } — revise와 같은 형식이라 화면이 같은 값을 두 번 보낸다.
import { planRerunById } from '../../../../../lib/run-commands';
import { RERUN_BODY_HINT, fail, ok, parseRerunBody, readJson, type RouteContext } from '../_shared';

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;

  const json = await readJson(request);
  if (!json.ok) return fail('INVALID_BODY', 'JSON 본문이 필요합니다.');
  const body = parseRerunBody(json.raw, false);
  if (!body) return fail('INVALID_BODY', RERUN_BODY_HINT);

  const result = await planRerunById({ runId: id, ...body });
  if (!result.ok) return fail(result.error.code, result.error.message);
  return ok(result.data);
}
