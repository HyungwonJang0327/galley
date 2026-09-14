import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { approveRun, planRerun, reviseRun } from './run-api-client';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('run-api-client', () => {
  it('approve는 본문 없이 POST하고 봉투를 그대로 돌려준다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { id: 'r1' } }));

    const result = await approveRun('r1');

    expect(fetchMock).toHaveBeenCalledWith('/api/runs/r1/approve', {
      method: 'POST',
      headers: undefined,
      body: undefined,
    });
    expect(result).toEqual({ ok: true, data: { id: 'r1' } });
  });

  it('rerun-plan·revise는 JSON 본문으로 POST한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: {} }));

    await planRerun('r1', { instruction: '부드럽게', startStep: 'velog' });
    await reviseRun('r1', { instruction: '부드럽게' });

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/runs/r1/rerun-plan');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ instruction: '부드럽게', startStep: 'velog' }),
    });
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/runs/r1/revise');
  });

  it('실패 봉투는 HTTP 상태와 무관하게 error를 그대로 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: { code: 'NOT_PENDING_APPROVAL', message: '승인 대기만' } },
        409,
      ),
    );

    expect(await approveRun('r1')).toEqual({
      ok: false,
      error: { code: 'NOT_PENDING_APPROVAL', message: '승인 대기만' },
    });
  });

  it('봉투가 아닌 응답·네트워크 실패는 REQUEST_FAILED로 감싼다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 500 }));
    const notJson = await approveRun('r1');
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.error.code).toBe('REQUEST_FAILED');

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    const offline = await reviseRun('r1', { instruction: 'x' });
    expect(offline.ok).toBe(false);
    if (!offline.ok) expect(offline.error.message).toContain('수정 지시');
  });

  it('id는 URL 인코딩한다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: {} }));
    await approveRun('a/b');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/runs/a%2Fb/approve');
  });
});
