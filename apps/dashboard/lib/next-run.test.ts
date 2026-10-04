import { describe, it, expect } from 'vitest';
import type { QueueSections } from '@galley/pipeline';
import { buildNextRunView } from './next-run';

const entry = (
  title: string,
  category: string | null = null,
  series: { key: string; episode: number; alreadyPublished: boolean } | null = null,
) => ({
  id: `id-${title}`,
  title,
  category,
  completedOn: null,
  series,
});

const sections = (waiting: ReturnType<typeof entry>[]): QueueSections => ({
  대기: waiting,
  후보: [],
  보류: [],
  완료: [],
});

describe('buildNextRunView', () => {
  it('대기 맨 위가 top, 그다음이 rest(파일 순서 그대로)', () => {
    const view = buildNextRunView(sections([entry('가'), entry('나'), entry('다')]));

    expect(view.top).toEqual({
      id: 'id-가',
      title: '가',
      category: undefined,
      runDisabledReason: undefined,
    });
    expect(view.rest.map((t) => t.title)).toEqual(['나', '다']);
  });

  it('rest는 최대 3개', () => {
    const view = buildNextRunView(
      sections([entry('1'), entry('2'), entry('3'), entry('4'), entry('5')]),
    );

    expect(view.rest.map((t) => t.title)).toEqual(['2', '3', '4']);
  });

  it('대기가 하나면 rest는 빈 배열', () => {
    const view = buildNextRunView(sections([entry('하나')]));

    expect(view.top?.title).toBe('하나');
    expect(view.rest).toEqual([]);
  });

  it('대기가 비면 top이 undefined(카드는 빈 상태)', () => {
    const view = buildNextRunView(sections([]));

    expect(view.top).toBeUndefined();
    expect(view.rest).toEqual([]);
  });

  it('카테고리가 있으면 그대로 넘긴다', () => {
    const view = buildNextRunView(sections([entry('가', '프론트')]));

    expect(view.top?.category).toBe('프론트');
  });

  it('(기존 글) 편이면 실행 불가 사유가 붙는다(행 ⋮과 같은 문구)', () => {
    const view = buildNextRunView(
      sections([entry('기존', null, { key: 'A', episode: 1, alreadyPublished: true })]),
    );

    expect(view.top?.runDisabledReason).toBe('이미 발행된 글입니다.');
  });
});
