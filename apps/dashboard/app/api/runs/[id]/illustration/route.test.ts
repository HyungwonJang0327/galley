import { describe, it, expect, vi, afterEach } from 'vitest';

const { getRunIllustration } = vi.hoisted(() => ({ getRunIllustration: vi.fn() }));

vi.mock('../../../../../lib/run-artifacts', () => ({ getRunIllustration }));

import { GET } from './route';

const context = (id = 'run_1') => ({ params: Promise.resolve({ id }) });
const request = (query: string) =>
  new Request(`http://localhost/api/runs/run_1/illustration${query}`);

afterEach(() => getRunIllustration.mockReset());

describe('GET /api/runs/[id]/illustration', () => {
  it('PNG 바이트를 image/png, no-store로 돌려준다 — n·lang을 어댑터에 넘긴다', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    getRunIllustration.mockResolvedValue({ ok: true, data: { bytes } });

    const response = await GET(request('?n=2&lang=ja'), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(getRunIllustration).toHaveBeenCalledWith('run_1', 2, 'ja');
  });

  it('lang이 ja가 아니면 한국어판, n이 숫자가 아니면 그대로 넘겨 어댑터가 거절한다', async () => {
    getRunIllustration.mockResolvedValue({
      ok: false,
      error: { code: 'ILLUSTRATION_MISSING', message: '문구' },
    });

    await GET(request('?n=1&lang=en'), context());
    expect(getRunIllustration).toHaveBeenLastCalledWith('run_1', 1, 'ko');
    await GET(request('?n=abc'), context());
    expect(getRunIllustration.mock.lastCall?.[1]).toBeNaN();
    // n이 없으면 0 — 범위 밖이라 어댑터가 없음으로 답한다.
    expect((await GET(request(''), context())).status).toBe(404);
    expect(getRunIllustration).toHaveBeenLastCalledWith('run_1', 0, 'ko');
  });

  it('없는 실행·없는 파일은 404, 설정·읽기 실패는 500 — JSON 봉투', async () => {
    for (const [code, status] of [
      ['RUN_NOT_FOUND', 404],
      ['ILLUSTRATION_MISSING', 404],
      ['DATA_DIR_MISSING', 500],
      ['ILLUSTRATION_UNREADABLE', 500],
      ['RUN_ILLUSTRATION_FAILED', 500],
    ] as const) {
      getRunIllustration.mockResolvedValue({ ok: false, error: { code, message: '문구' } });

      const response = await GET(request('?n=1'), context());

      expect(response.status, code).toBe(status);
      expect(await response.json()).toEqual({ ok: false, error: { code, message: '문구' } });
    }
  });
});
