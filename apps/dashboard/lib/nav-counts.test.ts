import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const { getQueueSections, countPendingApproval } = vi.hoisted(() => ({
  getQueueSections: vi.fn(),
  countPendingApproval: vi.fn(),
}));

vi.mock('./queue-data', () => ({ getQueueSections }));
// 실제 SQLite 대신 pipeline 경계만 가짜로(조회 자체는 pipeline 통합 테스트가 본다).
vi.mock('@galley/pipeline', () => ({ prisma: {}, countPendingApproval }));

import { getNavCounts } from './nav-counts';

const topic = (title: string) => ({ title, category: null, completedOn: null });

beforeEach(() => {
  countPendingApproval.mockResolvedValue(0);
});

afterEach(() => {
  getQueueSections.mockReset();
  countPendingApproval.mockReset();
});

describe('getNavCounts', () => {
  it('대기 개수는 주제_큐.md 대기 섹션에서 온다', async () => {
    getQueueSections.mockResolvedValue({
      ok: true,
      data: { 대기: [topic('가'), topic('나')], 후보: [topic('다')], 보류: [], 완료: [] },
    });

    expect(await getNavCounts()).toEqual({
      waiting: 2,
      pendingApproval: 0,
      publishPending: 0,
      monthlyCostUsd: 0,
    });
  });

  it('이미 읽은 섹션을 주면 다시 적재하지 않는다', async () => {
    const sections = { 대기: [topic('가')], 후보: [], 보류: [], 완료: [] };

    expect((await getNavCounts(sections)).waiting).toBe(1);
    expect(getQueueSections).not.toHaveBeenCalled();
  });

  it('승인 대기는 Run 조회 결과를 그대로 쓴다', async () => {
    getQueueSections.mockResolvedValue({
      ok: true,
      data: { 대기: [], 후보: [], 보류: [], 완료: [] },
    });
    countPendingApproval.mockResolvedValue(3);

    expect((await getNavCounts()).pendingApproval).toBe(3);
  });

  // 이 카운트는 셸 레이아웃이 매 요청 부른다 — 던지면 모든 화면이 500이 된다(CI에서 발견).
  it('DB가 없거나 조회가 실패해도 0으로 두고 나머지는 그대로 준다', async () => {
    getQueueSections.mockResolvedValue({
      ok: true,
      data: { 대기: [topic('가')], 후보: [], 보류: [], 완료: [] },
    });
    countPendingApproval.mockRejectedValue(new Error('no such table: Run'));

    expect(await getNavCounts()).toEqual({
      waiting: 1,
      pendingApproval: 0,
      publishPending: 0,
      monthlyCostUsd: 0,
    });
  });

  it('큐를 못 읽으면 대기는 0(화면은 안내 문구를 따로 그린다)', async () => {
    getQueueSections.mockResolvedValue({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '없음' },
    });

    expect((await getNavCounts()).waiting).toBe(0);
  });
});
