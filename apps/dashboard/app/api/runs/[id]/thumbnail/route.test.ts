import { describe, it, expect, vi, afterEach } from 'vitest';

const { getRunThumbnail } = vi.hoisted(() => ({ getRunThumbnail: vi.fn() }));

vi.mock('../../../../../lib/run-artifacts', () => ({ getRunThumbnail }));

import { GET } from './route';

const context = (id = 'run_1') => ({ params: Promise.resolve({ id }) });
const request = () => new Request('http://localhost/api/runs/run_1/thumbnail');

afterEach(() => getRunThumbnail.mockReset());

describe('GET /api/runs/[id]/thumbnail', () => {
  it('PNG 바이트를 image/png, no-store로 돌려준다', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    getRunThumbnail.mockResolvedValue({ ok: true, data: { bytes } });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(getRunThumbnail).toHaveBeenCalledWith('run_1');
  });

  it('없는 실행·없는 파일은 404, 설정·읽기 실패는 500 — JSON 봉투', async () => {
    for (const [code, status] of [
      ['RUN_NOT_FOUND', 404],
      ['THUMBNAIL_MISSING', 404],
      ['DATA_DIR_MISSING', 500],
      ['THUMBNAIL_UNREADABLE', 500],
      ['RUN_THUMBNAIL_FAILED', 500],
    ] as const) {
      getRunThumbnail.mockResolvedValue({ ok: false, error: { code, message: '문구' } });

      const response = await GET(request(), context());

      expect(response.status, code).toBe(status);
      expect(await response.json()).toEqual({ ok: false, error: { code, message: '문구' } });
    }
  });
});
