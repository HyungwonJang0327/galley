import { describe, test, expect } from 'vitest';
import { seriesChecklist } from './publishChecklist.ts';
import type { SeriesStepInfo } from './series.ts';

const base: SeriesStepInfo = { name: '앱 만들기', episodeNo: 2, total: 3, alreadyPublished: false };

describe('seriesChecklist', () => {
  test('시리즈가 아니면 빈 배열', () => {
    expect(seriesChecklist(undefined)).toEqual([]);
  });

  test('1편(이전 편 없음)은 시리즈 추가만', () => {
    expect(seriesChecklist({ ...base, episodeNo: 1 })).toEqual([
      { id: 'velog-series-add', params: { seriesName: '앱 만들기' } },
    ]);
  });

  test('이전 편 URL이 없으면 자리표시자 채우기 항목까지, 있으면 없음', () => {
    expect(seriesChecklist({ ...base, previous: { title: '첫 편' } })).toEqual([
      { id: 'velog-series-add', params: { seriesName: '앱 만들기' } },
      { id: 'velog-previous-link', params: { previousTitle: '첫 편' } },
    ]);
    expect(
      seriesChecklist({ ...base, previous: { title: '첫 편', url: 'https://velog.io/@x/a' } }),
    ).toEqual([{ id: 'velog-series-add', params: { seriesName: '앱 만들기' } }]);
  });
});
