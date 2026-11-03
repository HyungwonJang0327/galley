import { describe, it, expect, vi, afterEach } from 'vitest';

const { readWorkerHeartbeat, isWorkerAlive } = vi.hoisted(() => ({
  readWorkerHeartbeat: vi.fn(),
  isWorkerAlive: vi.fn(),
}));

// pipeline 경계만 가짜로 — 조회·30초 판정 자체는 pipeline 테스트(workerHeartbeat)가 본다.
vi.mock('@galley/pipeline', () => ({ prisma: {}, readWorkerHeartbeat, isWorkerAlive }));

import { getWorkerAlive } from './worker-status';

const NOW = new Date('2026-11-03T12:00:00.000Z');

afterEach(() => {
  readWorkerHeartbeat.mockReset();
  isWorkerAlive.mockReset();
});

describe('getWorkerAlive', () => {
  it('읽은 heartbeat와 현재 시각으로 판정한다', async () => {
    const beat = new Date('2026-11-03T11:59:55.000Z');
    readWorkerHeartbeat.mockResolvedValue(beat);
    isWorkerAlive.mockReturnValue(true);
    expect(await getWorkerAlive(NOW)).toBe(true);
    expect(isWorkerAlive).toHaveBeenCalledWith(beat, NOW);
  });

  it('조회가 실패해도 던지지 않고 꺼짐 — 셸이 죽지 않게', async () => {
    readWorkerHeartbeat.mockRejectedValue(new Error('no such table'));
    expect(await getWorkerAlive(NOW)).toBe(false);
    expect(isWorkerAlive).not.toHaveBeenCalled();
  });
});
