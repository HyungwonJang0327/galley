import { describe, it, expect } from 'vitest';
import type { QueueSections } from '@galley/pipeline';
import { buildQueueView } from './queue-view';

const entry = (
  title: string,
  category: string | null = null,
  completedOn: string | null = null,
) => ({
  title,
  category,
  completedOn,
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
      { title: '대기1', meta: undefined, index: 0 },
      { title: '대기2', meta: '프론트', index: 1 },
    ]);
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
      { title: '완료1', meta: '2026-09-01', index: 0 },
    ]);
  });
});
