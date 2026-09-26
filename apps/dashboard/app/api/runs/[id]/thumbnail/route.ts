// GET /api/runs/[id]/thumbnail — 발행정보 단계가 만든 썸네일 PNG(DATA_DIR). 실행 상세 타임라인의 <img>가 부른다.
// 이진 산출물은 RSC props로 못 넘겨 이것만 GET 라우트다(decisions/navigation.md 2026-09-26). 캐시하지 않는다 — 재실행이 같은 URL의 그림을 바꾼다.
import { getRunThumbnail } from '../../../../../lib/run-artifacts';
import { fail, type RouteContext } from '../_shared';

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const result = await getRunThumbnail(id);
  if (!result.ok) return fail(result.error.code, result.error.message);
  // Response 본문은 ArrayBuffer 기반 뷰만 받는다(TS) — 스토어의 Uint8Array<ArrayBufferLike>를 slice로 복사해 넘긴다.
  return new Response(result.data.bytes.slice(), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
