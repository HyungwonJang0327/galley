import { describe, it, expect } from 'vitest';
import { HEARTBEAT_TIMEOUT_MS } from './runOnce.ts';
import { isWorkerAlive } from './workerHeartbeat.ts';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('isWorkerAlive', () => {
  it('heartbeat가 없으면 죽은 것', () => {
    expect(isWorkerAlive(null, NOW)).toBe(false);
  });

  it('공백이 타임아웃까지면 살아 있다 — 실행 회수도 넘어야 일어난다', () => {
    expect(isWorkerAlive(ago(1_000), NOW)).toBe(true);
    expect(isWorkerAlive(ago(HEARTBEAT_TIMEOUT_MS), NOW)).toBe(true);
  });

  it('타임아웃을 넘으면 죽은 것', () => {
    expect(isWorkerAlive(ago(HEARTBEAT_TIMEOUT_MS + 1), NOW)).toBe(false);
  });

  it('미래 시각(시계 어긋남)은 살아 있는 것으로 본다', () => {
    expect(isWorkerAlive(ago(-5_000), NOW)).toBe(true);
  });
});
