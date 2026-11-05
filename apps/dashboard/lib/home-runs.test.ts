import { describe, it, expect, vi, afterEach } from 'vitest';

const { listRuns, listRecentRuns, countPendingApproval, getRunVerificationFlags, registryGet } =
  vi.hoisted(() => ({
    listRuns: vi.fn(),
    listRecentRuns: vi.fn(),
    countPendingApproval: vi.fn(),
    getRunVerificationFlags: vi.fn(),
    registryGet: vi.fn(),
  }));

// 조회 자체는 pipeline DB 테스트가 본다. 여기서는 행 만들기·더 보기 수·실패 봉투만.
// 라벨 매핑(run-labels)은 pipeline의 상태 어휘를 실제로 써야 하므로 조회 함수만 바꿔 끼운다.
vi.mock('@galley/pipeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@galley/pipeline')>()),
  prisma: {},
  listRuns,
  listRecentRuns,
  countPendingApproval,
  createModelRegistryFromEnv: () => ({ get: registryGet }),
}));
vi.mock('./run-artifacts', () => ({ getRunVerificationFlags }));

import { buildRecentRows, buildTodoRows, getHomeRuns, pendingSince } from './home-runs';
import type { RunListRow } from './run-list';

afterEach(() => {
  listRuns.mockReset();
  listRecentRuns.mockReset();
  countPendingApproval.mockReset();
  getRunVerificationFlags.mockReset();
  registryGet.mockReset();
});

const STARTED = '2026-11-06T01:00:00.000Z';

function row(overrides: Partial<RunListRow> = {}): RunListRow {
  return {
    id: 'run-1',
    topicId: 'topic-1',
    attempt: 1,
    topicSlug: 'topic',
    topicTitle: '무한 스크롤',
    status: 'pendingApproval',
    modelId: 'anthropic:x',
    startedAt: STARTED,
    finishedAt: null,
    steps: [],
    ...overrides,
  };
}

const step = (name: string, status: string, finishedAt: string | null) => ({
  name,
  status,
  origin: 'fresh',
  sourceRunId: null,
  finishedAt,
});

describe('pendingSince', () => {
  it('마지막으로 끝난 단계의 종료 시각(순서와 무관하게 가장 늦은 것)', () => {
    const r = row({
      steps: [
        step('evidence', 'succeeded', '2026-11-06T01:10:00.000Z'),
        step('velog', 'succeeded', '2026-11-06T01:30:00.000Z'),
        step('verify', 'succeeded', '2026-11-06T01:20:00.000Z'),
        step('linkedin', 'pending', null),
      ],
    });

    expect(pendingSince(r)).toBe('2026-11-06T01:30:00.000Z');
  });

  it('단계 기록이 없으면 실행 시작 시각', () => {
    expect(pendingSince(row())).toBe(STARTED);
  });
});

describe('buildTodoRows', () => {
  it('제목·마지막 단계·대기 시작 시각·승인 대기 배지·검수 링크, 근거 없음은 있을 때만', () => {
    const rows = buildTodoRows(
      [
        row({ id: 'a', steps: [step('evidence', 'succeeded', '2026-11-06T01:10:00.000Z')] }),
        row({ id: 'b', topicTitle: '둘째' }),
      ],
      { a: { unsupported: 2, uncertain: 1 }, b: { unsupported: 0, uncertain: 3 } },
    );

    expect(rows[0]).toMatchObject({
      id: 'a',
      title: '무한 스크롤',
      flag: '근거 없음 2',
      badge: { label: '승인 대기', tone: 'warning' },
      href: '/runs?tab=active&id=a',
    });
    expect(rows[0]?.meta).toMatch(/^근거 수집 완료 · \d{1,2}\. \d{1,2}\. \d{2}:\d{2}$/);
    expect(rows[1]).toMatchObject({ id: 'b', title: '둘째', flag: undefined });
    expect(rows[1]?.meta.startsWith('대기 · ')).toBe(true);
  });
});

describe('buildRecentRows', () => {
  it('결과 배지·모델 label·시간(종결됐으면 종결 시각)·탭에 맞는 링크', () => {
    const rows = buildRecentRows(
      [
        {
          id: 'done-1',
          topicId: 't',
          attempt: 2,
          topicSlug: 's',
          topicTitle: '완료된 글',
          status: 'done',
          modelId: 'anthropic:x',
          startedAt: new Date('2026-11-05T00:00:00.000Z'),
          finishedAt: new Date('2026-11-05T02:00:00.000Z'),
        },
        {
          id: 'run-2',
          topicId: 't2',
          attempt: 1,
          topicSlug: 's2',
          topicTitle: '도는 글',
          status: 'running',
          modelId: 'unknown:model',
          startedAt: new Date('2026-11-06T00:00:00.000Z'),
          finishedAt: null,
        },
      ],
      (id) => (id === 'anthropic:x' ? 'Claude X' : id),
    );

    expect(rows[0]).toMatchObject({
      title: '완료된 글',
      badge: { label: '완료', tone: 'success' },
      model: 'Claude X',
      href: '/runs?tab=done&id=done-1',
    });
    expect(rows[1]).toMatchObject({
      badge: { label: '실행 중', pulse: true },
      model: 'unknown:model',
      href: '/runs?tab=active&id=run-2',
    });
  });
});

describe('getHomeRuns', () => {
  it('승인 대기 5개 + 더 보기 수(전체 - 실은 수) + 최근 실행', async () => {
    const item = (id: string) => ({
      id,
      topicId: 't',
      attempt: 1,
      topicSlug: 's',
      topicTitle: id,
      status: 'pendingApproval',
      modelId: 'mock:m',
      startedAt: new Date(STARTED),
      finishedAt: null,
      steps: [],
    });
    listRuns.mockResolvedValue(['a', 'b', 'c', 'd', 'e'].map(item));
    countPendingApproval.mockResolvedValue(7);
    listRecentRuns.mockResolvedValue([{ ...item('r'), status: 'failed' }]);
    getRunVerificationFlags.mockResolvedValue({ b: { unsupported: 1, uncertain: 0 } });
    registryGet.mockReturnValue({ label: 'Mock' });

    const result = await getHomeRuns();

    expect(listRuns).toHaveBeenCalledWith({}, { tab: 'active', pendingOnly: true, limit: 5 });
    expect(listRecentRuns).toHaveBeenCalledWith({}, 5);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.todo.rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.data.todo.rows[1]?.flag).toBe('근거 없음 1');
    expect(result.data.todo.moreCount).toBe(2);
    expect(result.data.todo.moreHref).toBe('/runs?tab=active&pending=1');
    expect(result.data.recent[0]).toMatchObject({
      id: 'r',
      model: 'Mock',
      badge: { label: '실패' },
    });
  });

  it('승인 대기가 실은 수보다 적어도 더 보기는 0 아래로 내려가지 않는다', async () => {
    listRuns.mockResolvedValue([]);
    countPendingApproval.mockResolvedValue(0);
    listRecentRuns.mockResolvedValue([]);
    getRunVerificationFlags.mockResolvedValue({});

    const result = await getHomeRuns();

    expect(result).toEqual({
      ok: true,
      data: {
        todo: { rows: [], moreCount: 0, moreHref: '/runs?tab=active&pending=1' },
        recent: [],
      },
    });
  });

  it('조회가 던지면 HOME_RUNS_FAILED 봉투(홈이 죽지 않는다)', async () => {
    listRuns.mockResolvedValue([]);
    countPendingApproval.mockRejectedValue(new Error('SQLITE_BUSY'));
    listRecentRuns.mockResolvedValue([]);

    const result = await getHomeRuns();

    expect(result).toEqual({
      ok: false,
      error: { code: 'HOME_RUNS_FAILED', message: expect.stringContaining('SQLITE_BUSY') },
    });
  });

  it('실행 목록 조회 실패도 봉투로 옮긴다', async () => {
    listRuns.mockRejectedValue(new Error('disk'));
    countPendingApproval.mockResolvedValue(0);
    listRecentRuns.mockResolvedValue([]);

    const result = await getHomeRuns();

    expect(result.ok).toBe(false);
  });
});
