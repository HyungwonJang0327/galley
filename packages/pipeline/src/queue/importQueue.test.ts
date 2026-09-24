import { describe, test, expect } from 'vitest';
import { parsedQueueToRows } from './importQueue.ts';
import type { ParsedQueue } from './queueFile.ts';

describe('parsedQueueToRows', () => {
  test('섹션별 status와 0기반 order를 매기고 category·completedOn을 보존한다', () => {
    const parsed: ParsedQueue = {
      preamble: '',
      seriesDefs: [],
      sections: {
        대기: [{ title: 'A' }, { title: 'B' }],
        후보: [{ title: 'C', category: '카테고리1' }],
        보류: [],
        완료: [{ title: 'D', completedOn: '2026-09-01' }],
      },
    };

    const noHints = { repoNames: '[]', keywords: '[]', period: null };
    expect(parsedQueueToRows(parsed)).toEqual([
      { title: 'A', status: '대기', order: 0, category: null, completedOn: null, ...noHints },
      { title: 'B', status: '대기', order: 1, category: null, completedOn: null, ...noHints },
      {
        title: 'C',
        status: '후보',
        order: 0,
        category: '카테고리1',
        completedOn: null,
        ...noHints,
      },
      {
        title: 'D',
        status: '완료',
        order: 0,
        category: null,
        completedOn: '2026-09-01',
        ...noHints,
      },
    ]);
  });

  test('괄호 힌트를 리포·키워드·기간 컬럼으로 뽑되 제목은 원문 그대로 둔다', () => {
    const parsed: ParsedQueue = {
      preamble: '',
      seriesDefs: [],
      sections: {
        대기: [{ title: '벤더 정산 (Vendor Manager, react-query, 2024.03)' }],
        후보: [],
        보류: [],
        완료: [],
      },
    };
    const repos = [{ name: 'vendor-manager', aliases: ['vendor manager'] }];
    expect(parsedQueueToRows(parsed, repos)[0]).toMatchObject({
      title: '벤더 정산 (Vendor Manager, react-query, 2024.03)',
      repoNames: '["vendor-manager"]',
      keywords: '["react-query"]',
      period: '2024-03',
    });
    // 리포 목록이 없으면 전부 키워드
    expect(parsedQueueToRows(parsed)[0]).toMatchObject({
      repoNames: '[]',
      keywords: '["vendor manager","react-query"]',
      period: '2024-03',
    });
  });

  test('빈 큐는 빈 배열을 낸다', () => {
    const parsed: ParsedQueue = {
      preamble: '',
      seriesDefs: [],
      sections: { 대기: [], 후보: [], 보류: [], 완료: [] },
    };
    expect(parsedQueueToRows(parsed)).toEqual([]);
  });
});
