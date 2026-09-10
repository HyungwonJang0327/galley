import { describe, it, expect } from 'vitest';
import {
  QUEUE_TABS,
  parseQueueTab,
  parseCategory,
  listCategories,
  filterByCategory,
  queueHref,
} from './queue-tabs';

describe('QUEUE_TABS', () => {
  it('주제_큐.md 섹션 4개와 1:1, 파일 순서 그대로', () => {
    expect(QUEUE_TABS.map((t) => [t.id, t.status])).toEqual([
      ['waiting', '대기'],
      ['candidates', '후보'],
      ['hold', '보류'],
      ['done', '완료'],
    ]);
  });
});

describe('parseQueueTab', () => {
  it('?tab= 값에 맞는 탭', () => {
    expect(parseQueueTab('candidates').status).toBe('후보');
    expect(parseQueueTab('done').status).toBe('완료');
  });

  it('없거나 모르는 값이면 대기', () => {
    expect(parseQueueTab(undefined).id).toBe('waiting');
    expect(parseQueueTab('unknown').id).toBe('waiting');
  });

  it('같은 키가 여러 번이면 첫 값', () => {
    expect(parseQueueTab(['hold', 'done']).id).toBe('hold');
  });
});

describe('parseCategory', () => {
  it('앞뒤 공백을 자르고, 비었으면 undefined', () => {
    expect(parseCategory(' 프론트 ')).toBe('프론트');
    expect(parseCategory('')).toBeUndefined();
    expect(parseCategory(undefined)).toBeUndefined();
  });

  it('여러 번이면 첫 값', () => {
    expect(parseCategory(['A', 'B'])).toBe('A');
  });
});

const topics = [
  { title: '1', category: 'A' },
  { title: '2', category: null },
  { title: '3', category: 'B' },
  { title: '4', category: 'A' },
];

describe('listCategories', () => {
  it('처음 나온 순서대로 중복 없이, 카테고리 없는 항목은 제외', () => {
    expect(listCategories(topics)).toEqual(['A', 'B']);
  });
});

describe('filterByCategory', () => {
  it('카테고리가 같은 항목만', () => {
    expect(filterByCategory(topics, 'A').map((t) => t.title)).toEqual(['1', '4']);
  });

  it('카테고리가 없으면 전체', () => {
    expect(filterByCategory(topics, undefined)).toHaveLength(4);
  });

  it('목록에 없는 카테고리(낡은 URL)면 전체', () => {
    expect(filterByCategory(topics, '없음')).toHaveLength(4);
  });
});

describe('queueHref', () => {
  it('탭만', () => {
    expect(queueHref('hold')).toBe('/queue?tab=hold');
  });

  it('카테고리는 인코딩해서 붙인다', () => {
    expect(queueHref('candidates', '프론트 & 백')).toBe(
      '/queue?tab=candidates&category=%ED%94%84%EB%A1%A0%ED%8A%B8+%26+%EB%B0%B1',
    );
  });
});
