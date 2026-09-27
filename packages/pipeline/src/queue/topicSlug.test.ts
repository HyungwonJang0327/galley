import { describe, test, expect } from 'vitest';
import { slugForTopicTitle, topicSlug } from './topicSlug.ts';

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

  test('따옴표·괄호·특수문자는 구분자로 본다(글자 변환만 — 힌트를 떼는 것은 slugForTopicTitle)', () => {
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

describe('slugForTopicTitle — 큐 제목에서 주제 슬러그(decisions/topic-slug.md 규칙 1)', () => {
  test('괄호 힌트(리포 별칭·기간)는 슬러그에 들어가지 않는다', () => {
    expect(slugForTopicTitle('무한 스크롤 (spacehome)')).toBe('무한-스크롤');
    expect(slugForTopicTitle('택배사별 엑셀 정렬 (vendor manager, 2024.03)')).toBe(
      '택배사별-엑셀-정렬',
    );
    expect(slugForTopicTitle('（전각 힌트） 무한 스크롤')).toBe('무한-스크롤');
  });

  test('힌트만 고쳐도 슬러그는 같다', () => {
    expect(slugForTopicTitle('무한 스크롤 (spacehome, react-router)')).toBe(
      slugForTopicTitle('무한 스크롤 (spacehome)'),
    );
  });

  test('완료 줄의 (posts/…)·줄 끝 URL·시리즈 태그도 뗀다 — 되돌린 줄에서 슬러그가 길어지지 않는다', () => {
    expect(slugForTopicTitle('무한 스크롤 미리 불러오기 (posts/무한-스크롤-spacehome)')).toBe(
      '무한-스크롤-미리-불러오기',
    );
    expect(
      slugForTopicTitle('무한 스크롤 미리 불러오기 (posts/무한-스크롤) https://velog.io/@me/x'),
    ).toBe('무한-스크롤-미리-불러오기');
    expect(slugForTopicTitle('[A-1] DB 세션 다시 보기 (linklet)')).toBe('db-세션-다시-보기');
  });

  test('힌트뿐인 제목은 topic(함수의 폴백 — startRun은 이런 제목을 EMPTY_TITLE로 거절한다)', () => {
    expect(slugForTopicTitle('(spacehome)')).toBe('topic');
  });

  test('80자 절단은 힌트를 뗀 뒤에 건다(긴 힌트가 제목 글자를 밀어내지 않는다)', () => {
    const title = `${'가'.repeat(70)} (${'a'.repeat(60)})`;
    expect(slugForTopicTitle(title)).toBe('가'.repeat(70));
  });

  test('제목 본문의 괄호도 뗀다 — 매칭 키(normalizeTopicTitle)와 같은 범위(알려진 한계)', () => {
    expect(slugForTopicTitle('useEffect(의존성 배열) 정리')).toBe('useeffect-정리');
  });
});
