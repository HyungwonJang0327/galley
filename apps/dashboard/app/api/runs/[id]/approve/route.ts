// POST /api/runs/[id]/approve — 승인 대기 실행을 승인(done)한다. 본문 없음.
// 승인은 Run 상태 변경일 뿐이다 — 공개 발행은 여기서 일어나지 않는다(decisions/publish-gate.md).
import { approveRunById } from '../../../../../lib/run-commands';
import { fail, ok, type RouteContext } from '../_shared';

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const result = await approveRunById(id);
  if (!result.ok) return fail(result.error.code, result.error.message);
  return ok(result.data);
}
