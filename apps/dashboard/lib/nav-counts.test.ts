import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const { countTopicsByStatus, countPendingApproval } = vi.hoisted(() => ({
  countTopicsByStatus: vi.fn(),
  countPendingApproval: vi.fn(),
}));

// 실제 SQLite 대신 pipeline 경계만 가짜로(조회 자체는 pipeline 통합 테스트가 본다).
vi.mock('@galley/pipeline', () => ({ prisma: {}, countPendingApproval, countTopicsByStatus }));

import { getNavCounts } from './nav-counts';

const topic = (title: string) => ({ title, category: null, completedOn: null });

beforeEach(() => {
  countPendingApproval.mockResolvedValue(0);
  countTopicsByStatus.mockResolvedValue(0);
});

afterEach(() => {
  countTopicsByStatus.mockReset();
  countPendingApproval.mockReset();
});

describe('getNavCounts', () => {
  it('대기 개수는 DB에서 세고 파일을 다시 읽지 않는다', async () => {
    countTopicsByStatus.mockResolvedValue(2);

    expect(await getNavCounts()).toEqual({
      waiting: 2,
      pendingApproval: 0,
      publishPending: 0,
      monthlyCostUsd: 0,
    });
    expect(countTopicsByStatus.mock.calls[0]?.[1]).toBe('대기');
  });

  it('이미 읽은 섹션을 주면 DB를 세지 않는다(화면과 같은 순간의 값)', async () => {
    const sections = { 대기: [topic('가')], 후보: [], 보류: [], 완료: [] };

    expect((await getNavCounts(sections)).waiting).toBe(1);
    expect(countTopicsByStatus).not.toHaveBeenCalled();
  });

  it('조회가 실패해도 0으로 두고 던지지 않는다(셸이 죽으면 모든 화면이 500)', async () => {
    countTopicsByStatus.mockRejectedValue(new Error('no such table'));

    expect((await getNavCounts()).waiting).toBe(0);
  });

  it('승인 대기는 Run 조회 결과를 그대로 쓴다', async () => {
    countPendingApproval.mockResolvedValue(3);

    expect((await getNavCounts()).pendingApproval).toBe(3);
  });

  // 이 카운트는 셸 레이아웃이 매 요청 부른다 — 던지면 모든 화면이 500이 된다(CI에서 발견).
  it('DB가 없거나 조회가 실패해도 0으로 두고 나머지는 그대로 준다', async () => {
    countTopicsByStatus.mockResolvedValue(1);
    countPendingApproval.mockRejectedValue(new Error('no such table: Run'));

    expect(await getNavCounts()).toEqual({
      waiting: 1,
      pendingApproval: 0,
      publishPending: 0,
      monthlyCostUsd: 0,
    });
  });
});
