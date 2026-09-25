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

  test('이전 편이 (기존 글)이어도 같은 기준 — 줄 끝 URL이 있으면 항목 없음, 없으면 자리표시자 채우기', () => {
    // (기존 글) 편은 어느 섹션에 있든 줄 끝 velog URL을 읽는다(seriesContext) — 헤더 자리표시자 판정과 같은 조건.
    const published = { title: '세션 방식, 석 달 뒤 다시 열어보기', url: 'https://velog.io/@x/s' };
    expect(seriesChecklist({ ...base, episodeNo: 7, previous: published })).toEqual([
      { id: 'velog-series-add', params: { seriesName: '앱 만들기' } },
    ]);
    expect(
      seriesChecklist({ ...base, episodeNo: 7, previous: { title: published.title } }),
    ).toEqual([
      { id: 'velog-series-add', params: { seriesName: '앱 만들기' } },
      { id: 'velog-previous-link', params: { previousTitle: published.title } },
    ]);
  });

  test('id별 params가 타입으로 묶인다', () => {
    const [add] = seriesChecklist({ ...base, previous: { title: '첫 편' } });
    if (add?.id !== 'velog-series-add') throw new Error('첫 항목은 시리즈 추가');
    // 판별 뒤에는 그 id의 params만 보인다 — 다른 키를 쓰면 typecheck가 잡는다.
    expect(add.params.seriesName).toBe('앱 만들기');
  });
});
