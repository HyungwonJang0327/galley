import { describe, it, expect } from 'vitest';
import { queueStatusBadgeTone } from './queue-status-badge';

describe('queueStatusBadgeTone', () => {
  // decisions/layout.md §5: 대기 블루 / 후보·보류 회색 / 완료 초록
  it.each([
    ['waiting', 'info'],
    ['candidate', 'neutral'],
    ['hold', 'neutral'],
    ['done', 'success'],
  ] as const)('%s → %s', (status, tone) => {
    expect(queueStatusBadgeTone(status)).toBe(tone);
  });
});
