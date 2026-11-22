// GET /api/runs/[id]/illustration?n=1&lang=ja — 삽화 단계가 만든 PNG 한 장(DATA_DIR). 실행 상세 타임라인의 <img>가 부른다.
// 썸네일 라우트와 같은 이유로 GET이다(이진 산출물은 RSC props로 못 넘긴다 — decisions/navigation.md 2026-09-26). 캐시하지 않는다.
// `n`은 삽화 번호(1부터), `lang=ja`면 일본어 캡션판 — 그 밖의 값은 한국어판. 번호 검증은 어댑터가 한다.
import { getRunIllustration } from '../../../../../lib/run-artifacts';
import { fail, type RouteContext } from '../_shared';

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  const query = new URL(request.url).searchParams;
  const result = await getRunIllustration(
    id,
    Number(query.get('n') ?? ''),
    query.get('lang') === 'ja' ? 'ja' : 'ko',
  );
  if (!result.ok) return fail(result.error.code, result.error.message);
  // Response 본문은 ArrayBuffer 기반 뷰만 받는다(TS) — 스토어의 Uint8Array<ArrayBufferLike>를 slice로 복사해 넘긴다.
  return new Response(result.data.bytes.slice(), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
