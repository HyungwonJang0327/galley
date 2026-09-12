import { describe, test, expect } from 'vitest';
import { topicSlug } from './topicSlug.ts';

describe('topicSlug', () => {
  test('같은 제목이면 언제나 같은 슬러그(재적재에도 안정)', () => {
    expect(topicSlug('커서 기반 무한 스크롤')).toBe(topicSlug('커서 기반 무한 스크롤'));
  });

  test('한글은 그대로 두고 공백만 하이픈으로', () => {
    expect(topicSlug('커서 기반 무한 스크롤')).toBe('커서-기반-무한-스크롤');
  });

  test('영문은 소문자로', () => {
    expect(topicSlug('Cursor Based Paging')).toBe('cursor-based-paging');
  });

  test('따옴표·괄호·특수문자는 구분자로 본다', () => {
    expect(topicSlug('채팅 "더 불러오기" — 스크롤 위치 유지')).toBe(
      '채팅-더-불러오기-스크롤-위치-유지',
    );
    expect(topicSlug('택배사별 엑셀 정렬 (vendor manager, 2024.03)')).toBe(
      '택배사별-엑셀-정렬-vendor-manager-2024-03',
    );
  });

  test('양끝·중복 하이픈을 정리한다', () => {
    expect(topicSlug('  --제목--  ')).toBe('제목');
    expect(topicSlug('a   b')).toBe('a-b');
  });

  test('서로 다른 제목은 서로 다른 슬러그', () => {
    expect(topicSlug('무한 스크롤 A')).not.toBe(topicSlug('무한 스크롤 B'));
  });

  test('기호만 있는 제목도 빈 슬러그가 되지 않는다', () => {
    expect(topicSlug('!!! ???')).toBe('topic');
  });

  test('아주 긴 제목은 잘리되 하이픈으로 끝나지 않는다', () => {
    const slug = topicSlug('가'.repeat(50) + ' ' + '나'.repeat(50));

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});
