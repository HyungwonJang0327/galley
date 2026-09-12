import { describe, it, expect, vi, afterEach } from 'vitest';

const { getQueueSections } = vi.hoisted(() => ({ getQueueSections: vi.fn() }));

vi.mock('./queue-data', () => ({ getQueueSections }));

import { getNavCounts } from './nav-counts';

const topic = (title: string) => ({ title, category: null, completedOn: null });

afterEach(() => {
  getQueueSections.mockReset();
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

  it('큐를 못 읽으면 대기는 0(화면은 안내 문구를 따로 그린다)', async () => {
    getQueueSections.mockResolvedValue({
      ok: false,
      error: { code: 'BLOG_DIR_MISSING', message: '없음' },
    });

    expect((await getNavCounts()).waiting).toBe(0);
  });
});
