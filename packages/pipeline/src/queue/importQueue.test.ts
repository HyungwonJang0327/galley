import { describe, test, expect } from 'vitest';
import { parsedQueueToRows } from './importQueue.ts';
import type { ParsedQueue } from './queueFile.ts';

describe('parsedQueueToRows', () => {
  test('섹션별 status와 0기반 order를 매기고 category·completedOn을 보존한다', () => {
    const parsed: ParsedQueue = {
      preamble: '',
      sections: {
        대기: [{ title: 'A' }, { title: 'B' }],
        후보: [{ title: 'C', category: '카테고리1' }],
        보류: [],
        완료: [{ title: 'D', completedOn: '2026-09-01' }],
      },
    };

    expect(parsedQueueToRows(parsed)).toEqual([
      { title: 'A', status: '대기', order: 0, category: null, completedOn: null },
      { title: 'B', status: '대기', order: 1, category: null, completedOn: null },
      { title: 'C', status: '후보', order: 0, category: '카테고리1', completedOn: null },
      { title: 'D', status: '완료', order: 0, category: null, completedOn: '2026-09-01' },
    ]);
  });

  test('빈 큐는 빈 배열을 낸다', () => {
    const parsed: ParsedQueue = {
      preamble: '',
      sections: { 대기: [], 후보: [], 보류: [], 완료: [] },
    };
    expect(parsedQueueToRows(parsed)).toEqual([]);
  });
});
