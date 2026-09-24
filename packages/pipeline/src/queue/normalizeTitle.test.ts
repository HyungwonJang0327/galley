import { describe, it, expect } from 'vitest';
import { normalizeTopicTitle, stripTopicHints } from './normalizeTitle.ts';

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

  it('맨 앞 시리즈 태그를 뗀다 — 태그를 붙이거나 편 번호를 바꿔도 같은 항목이다', () => {
    const plain = normalizeTopicTitle('Clerk 붙이기 — 온보딩 화면');
    expect(normalizeTopicTitle('[A-2] Clerk 붙이기 — 온보딩 화면')).toBe(plain);
    expect(normalizeTopicTitle('[A-12] Clerk 붙이기 — 온보딩 화면')).toBe(plain);
  });

  it('태그 없는 제목의 키는 바뀌지 않는다', () => {
    expect(normalizeTopicTitle('결제 페이지 뒤로가기 방지 (spacehome)')).toBe(
      '결제 페이지 뒤로가기 방지',
    );
  });

  it('맨 앞이 아닌 [A-1]과 태그 모양이 아닌 대괄호는 제목의 일부다', () => {
    expect(normalizeTopicTitle('정리 [A-1] 메모')).toBe('정리 [a-1] 메모');
    expect(normalizeTopicTitle('[a-1] 소문자')).toBe('[a-1] 소문자');
    expect(normalizeTopicTitle('[A-100] 세 자리')).toBe('[a-100] 세 자리');
    expect(normalizeTopicTitle('[A-1]붙여쓰기')).toBe('[a-1]붙여쓰기');
    expect(normalizeTopicTitle('[A-0] 영 편')).toBe('[a-0] 영 편');
    expect(normalizeTopicTitle('[A-01] 앞자리 영')).toBe('[a-01] 앞자리 영');
  });

  it('완료 줄 끝의 URL을 뗀다 — 발행 뒤 URL을 붙여도 같은 항목이다', () => {
    const before = '[B-6] DB 세션 다시 보기 (posts/db-session)';
    expect(normalizeTopicTitle(`${before} https://velog.io/@someone/db-session`)).toBe(
      normalizeTopicTitle(before),
    );
  });

  it('줄 끝이 아닌 URL은 제목의 일부다', () => {
    expect(normalizeTopicTitle('https://example.com 파싱하기')).toBe(
      'https://example.com 파싱하기',
    );
  });

  it('힌트뿐인 제목은 빈 문자열이 된다', () => {
    expect(normalizeTopicTitle('(hint)')).toBe('');
  });
});

describe('stripTopicHints', () => {
  it('괄호 힌트만 떼고 대소문자·원문은 유지한다(전각 괄호 포함)', () => {
    expect(stripTopicHints('무한 스크롤 (spacehome, react-router)')).toBe('무한 스크롤');
    expect(stripTopicHints('PG사 무중단 전환기 （Toss → NicePay） 정리')).toBe(
      'PG사 무중단 전환기 정리',
    );
    expect(stripTopicHints('  Hello  ')).toBe('Hello');
  });

  it('시리즈 태그와 줄 끝 URL도 뗀다', () => {
    expect(stripTopicHints('[A-1] 스냅과 아티클 (후보의 항목을 1편으로)')).toBe('스냅과 아티클');
    expect(stripTopicHints('[B-6] (기존 글) DB 세션 https://velog.io/@x/y')).toBe('DB 세션');
  });
});
