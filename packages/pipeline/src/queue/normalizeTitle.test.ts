import { describe, it, expect } from 'vitest';
import { normalizeTopicTitle } from './normalizeTitle.ts';

describe('normalizeTopicTitle', () => {
  it('괄호 힌트를 뺀 제목 본문만 남긴다', () => {
    expect(normalizeTopicTitle('무한 스크롤 (spacehome, react-router)')).toBe('무한 스크롤');
  });

  it('힌트만 바뀌면 같은 값이다(같은 항목으로 매칭된다)', () => {
    expect(normalizeTopicTitle('무한 스크롤 (spacehome)')).toBe(
      normalizeTopicTitle('무한 스크롤 (spacehome, react-router)'),
    );
  });

  it('앞뒤·연속 공백과 대소문자를 무시한다', () => {
    expect(normalizeTopicTitle('  React  Router  ')).toBe(normalizeTopicTitle('react router'));
  });

  it('전각 괄호도 힌트로 본다', () => {
    expect(normalizeTopicTitle('무한 스크롤（spacehome）')).toBe('무한 스크롤');
  });

  it('제목 본문이 바뀌면 다른 값이다(다른 항목이 된다)', () => {
    expect(normalizeTopicTitle('무한 스크롤')).not.toBe(normalizeTopicTitle('무한 스크롤 개선기'));
  });

  it('힌트뿐인 제목은 빈 문자열이 된다', () => {
    expect(normalizeTopicTitle('(hint)')).toBe('');
  });
});
