// 실행 명령 API(/api/runs/[id]/*)의 브라우저 쪽 호출. 클라이언트 컴포넌트가 쓰므로 server-only가
// 아니고, pipeline·run-commands는 **타입만** 가져온다(decisions/server-only-boundary.md).
// 응답 봉투는 { ok, data } | { ok, error:{ code, message } } 둘뿐(decisions/error-handling.md ③).
// HTTP 상태가 아니라 `ok`로 판별한다.
import type { RerunPlanView, RevisedRun, RunRecord } from './run-commands';

export interface ApiFailure {
  ok: false;
  error: { code: string; message: string };
}
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export interface RerunRequest {
  instruction: string;
  startStep?: string;
}

const REQUEST_FAILED = (what: string): ApiFailure => ({
  ok: false,
  error: { code: 'REQUEST_FAILED', message: `${what} 요청이 실패했습니다. 다시 눌러 주세요.` },
});

function isEnvelope(value: unknown): value is ApiResult<unknown> {
  if (typeof value !== 'object' || value === null || !('ok' in value)) return false;
  const v = value as { ok: unknown; error?: unknown };
  if (v.ok === true) return true;
  if (v.ok !== false || typeof v.error !== 'object' || v.error === null) return false;
  const e = v.error as { code?: unknown; message?: unknown };
  return typeof e.code === 'string' && typeof e.message === 'string';
}

async function post<T>(path: string, body: unknown, what: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await response.json();
    if (!isEnvelope(json)) return REQUEST_FAILED(what);
    return json as ApiResult<T>;
  } catch {
    return REQUEST_FAILED(what);
  }
}

export function approveRun(runId: string): Promise<ApiResult<RunRecord>> {
  return post(`/api/runs/${encodeURIComponent(runId)}/approve`, undefined, '승인');
}

export function planRerun(runId: string, body: RerunRequest): Promise<ApiResult<RerunPlanView>> {
  return post(`/api/runs/${encodeURIComponent(runId)}/rerun-plan`, body, '재실행 계획');
}

export function reviseRun(runId: string, body: RerunRequest): Promise<ApiResult<RevisedRun>> {
  return post(`/api/runs/${encodeURIComponent(runId)}/revise`, body, '수정 지시');
}
