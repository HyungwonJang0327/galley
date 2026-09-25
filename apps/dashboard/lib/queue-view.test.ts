import { describe, it, expect } from 'vitest';
import type { QueueSections, QueueSeriesSummary } from '@galley/pipeline';
import { buildQueueView } from './queue-view';

const entry = (
  title: string,
  category: string | null = null,
  completedOn: string | null = null,
) => ({
  id: `id-${title}`,
  title,
  category,
  completedOn,
  series: null,
});

const sections: QueueSections = {
  대기: [entry('대기1'), entry('대기2', '프론트')],
  후보: [entry('후보1', '프론트'), entry('후보2', '백엔드'), entry('후보3', '프론트')],
  보류: [entry('보류1')],
  완료: [entry('완료1', null, '2026-09-01')],
};

describe('buildQueueView', () => {
  it('탭 4개, 개수는 대기·후보만(필터와 무관한 섹션 전체 개수)', () => {
    const view = buildQueueView(sections, { tab: 'candidates', category: '프론트' });
    expect(view.tabs.map((tab) => [tab.id, tab.count, tab.isActive])).toEqual([
      ['waiting', 2, false],
      ['candidates', 3, true],
      ['hold', undefined, false],
      ['done', undefined, false],
    ]);
  });

  it('탭이 없으면 대기 섹션을 파일 순서대로, 보조 텍스트는 카테고리', () => {
    const view = buildQueueView(sections, {});
    expect(view.active.status).toBe('대기');
    expect(view.rows).toEqual([
      { id: 'id-대기1', title: '대기1', meta: undefined, index: 0, series: undefined },
      { id: 'id-대기2', title: '대기2', meta: '프론트', index: 1, series: undefined },
    ]);
    expect(view.items).toEqual(view.rows.map((row) => ({ kind: 'row', row })));
  });

  it('카테고리 선택지는 후보 탭에서만', () => {
    expect(buildQueueView(sections, { tab: 'candidates' }).categories).toEqual([
      '프론트',
      '백엔드',
    ]);
    expect(buildQueueView(sections, { tab: 'waiting', category: '프론트' }).categories).toEqual([]);
  });

  it('후보 탭에서 카테고리를 고르면 그 행만', () => {
    const view = buildQueueView(sections, { tab: 'candidates', category: '프론트' });
    expect(view.category).toBe('프론트');
    expect(view.rows.map((row) => row.title)).toEqual(['후보1', '후보3']);
  });

  it('행 위치는 필터 전 섹션 기준이다(이동이 파일에서 항목을 찾는 키)', () => {
    const view = buildQueueView(sections, { tab: 'candidates', category: '프론트' });
    expect(view.rows.map((row) => row.index)).toEqual([0, 2]);
  });

  it('다른 탭의 ?category=는 무시한다', () => {
    const view = buildQueueView(sections, { tab: 'waiting', category: '프론트' });
    expect(view.category).toBeUndefined();
    expect(view.rows).toHaveLength(2);
  });

  it('목록에 없는 카테고리는 선택 안 함으로 본다', () => {
    const view = buildQueueView(sections, { tab: 'candidates', category: '없음' });
    expect(view.category).toBeUndefined();
    expect(view.rows).toHaveLength(3);
  });

  it('완료 탭 보조 텍스트는 완료일', () => {
    expect(buildQueueView(sections, { tab: 'done' }).rows).toEqual([
      { id: 'id-완료1', title: '완료1', meta: '2026-09-01', index: 0, series: undefined },
    ]);
  });
});

const seriesEntry = (
  title: string,
  key: string,
  episode: number,
  category: string | null = '시리즈',
  alreadyPublished = false,
) => ({ ...entry(title, category), series: { key, episode, alreadyPublished } });

const summary = (
  key: string,
  name: string,
  position: number,
  byStatus: Partial<Record<'대기' | '후보' | '보류' | '완료', number>>,
): QueueSeriesSummary => {
  const counts = { 대기: 0, 후보: 0, 보류: 0, 완료: 0, ...byStatus };
  return {
    key,
    name,
    category: '시리즈',
    position,
    episodeCount: counts.대기 + counts.후보 + counts.보류 + counts.완료,
    byStatus: counts,
  };
};

describe('buildQueueView — 시리즈', () => {
  // 후보: [프론트] 후보1 / [시리즈] 정의 A → A-3, 정의 D(편 없음), 정의 E → E-1 (기존 글)
  const withSeries: QueueSections = {
    대기: [seriesEntry('둘째 편', 'A', 2, null), seriesEntry('D 편', 'D', 1, null), entry('일반')],
    후보: [
      entry('후보1', '프론트'),
      seriesEntry('셋째 편', 'A', 3),
      seriesEntry('(기존 글) 옛 글', 'E', 1, '시리즈', true),
    ],
    보류: [],
    완료: [],
  };
  const defs = [
    summary('A', '앱 만들기', 1, { 대기: 1, 후보: 1 }),
    summary('D', '정의만 남음', 2, { 대기: 1 }),
    summary('E', '기존 글 시리즈', 2, { 후보: 1 }),
  ];

  it('시리즈 편 행은 배지 글자와 툴팁(시리즈명 · N/M편), 태그는 제목에 없다', () => {
    const view = buildQueueView(withSeries, {}, defs);
    expect(view.rows.map((row) => [row.title, row.series])).toEqual([
      ['둘째 편', { label: 'A-2', tooltip: '앱 만들기 · 2/2편', alreadyPublished: false }],
      ['D 편', { label: 'D-1', tooltip: '정의만 남음 · 1/1편', alreadyPublished: false }],
      ['일반', undefined],
    ]);
  });

  it('정의 줄이 없는 태그는 배지만, 툴팁은 없다(이름을 지어내지 않음)', () => {
    const view = buildQueueView(withSeries, {}, []);
    expect(view.rows[0]?.series).toEqual({
      label: 'A-2',
      tooltip: undefined,
      alreadyPublished: false,
    });
  });

  it('후보 탭은 정의 줄 자리에 그룹 헤더를 끼운다 — 편 없는 정의는 다음 항목 앞, 후보에 편이 없으면 안내', () => {
    const view = buildQueueView(withSeries, { tab: 'candidates' }, defs);
    expect(
      view.items.map((item) =>
        item.kind === 'row'
          ? item.row.title
          : [item.group.key, item.group.name, item.group.hint, item.group.position],
      ),
    ).toEqual([
      '후보1',
      ['A', '앱 만들기', undefined, 1],
      '셋째 편',
      ['D', '정의만 남음', '편 없음 · 대기 1편', 2],
      ['E', '기존 글 시리즈', undefined, 2],
      '(기존 글) 옛 글',
    ]);
    expect(view.rows[2]?.series?.alreadyPublished).toBe(true);
  });

  it('정의 줄이 맨 끝(뒤에 항목 없음)이면 헤더도 맨 끝', () => {
    const view = buildQueueView(
      { ...withSeries, 후보: [entry('후보1', '프론트')] },
      { tab: 'candidates' },
      [summary('G', '예정', 1, {})],
    );
    expect(view.items.map((item) => item.kind)).toEqual(['row', 'group']);
    expect(view.items[1]).toMatchObject({ group: { key: 'G', hint: '편 없음' } });
  });

  it('후보에 항목이 하나도 없고 정의 줄만 남아도 헤더는 items에 남는다(화면이 안내를 보인다)', () => {
    const view = buildQueueView({ ...withSeries, 후보: [] }, { tab: 'candidates' }, [
      summary('D', '정의만 남음', 0, { 대기: 3 }),
    ]);
    expect(view.rows).toEqual([]);
    expect(view.items).toEqual([
      {
        kind: 'group',
        group: { key: 'D', name: '정의만 남음', hint: '편 없음 · 대기 3편', position: 0 },
      },
    ]);
  });

  it('카테고리 필터가 있으면 그 소제목의 정의 줄만, 다른 탭에는 헤더가 없다', () => {
    const front = buildQueueView(withSeries, { tab: 'candidates', category: '프론트' }, defs);
    expect(front.items.map((item) => item.kind)).toEqual(['row']);
    const series = buildQueueView(withSeries, { tab: 'candidates', category: '시리즈' }, defs);
    expect(series.items.filter((item) => item.kind === 'group')).toHaveLength(3);
    expect(
      buildQueueView(withSeries, { tab: 'waiting' }, defs).items.every((i) => i.kind === 'row'),
    ).toBe(true);
  });
});
