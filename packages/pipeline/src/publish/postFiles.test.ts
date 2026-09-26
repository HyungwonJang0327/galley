import { describe, test, expect } from 'vitest';
import { postFileNames, toFileStem } from './postFiles.ts';

describe('toFileStem', () => {
  test('공백은 _로, 나머지 글자는 그대로(기존 산출물 관례)', () => {
    expect(toFileStem('노래 퀴즈 앱을 다 만들고 나서야 Apple Music 약관을 읽기')).toBe(
      '노래_퀴즈_앱을_다_만들고_나서야_Apple_Music_약관을_읽기',
    );
  });

  test('경로 구분자·Windows 금지 문자·제어 문자는 뗀다', () => {
    expect(toFileStem('a/b\\c:d*e?f"g<h>i|j\u0000k')).toBe('abcdefghijk');
  });

  test('연속 공백·_는 하나로, 앞뒤 _·.은 뗀다(숨김 파일·.. 방지)', () => {
    expect(toFileStem('  ..제목  __ 끝.. ')).toBe('제목_끝');
    expect(toFileStem('..')).toBe('post');
    expect(toFileStem('')).toBe('post');
  });

  test('60자를 넘으면 자르고, 자른 끝의 _·.도 뗀다', () => {
    const long = `${'가'.repeat(59)} 나다라`;
    expect(toFileStem(long)).toBe('가'.repeat(59));
    expect(toFileStem('가'.repeat(80))).toHaveLength(60);
  });

  test('NFD로 들어온 한글도 NFC로 같은 이름', () => {
    expect(toFileStem('한글'.normalize('NFD'))).toBe('한글');
  });
});

describe('postFileNames', () => {
  test('7개 파일 이름 — 사람이 읽는 5개는 제목 줄기, evidence·verification은 고정', () => {
    expect(postFileNames('무한 스크롤 미리 불러오기')).toEqual({
      velog: '무한_스크롤_미리_불러오기.md',
      linkedin: '무한_스크롤_미리_불러오기_링크드인.md',
      zenn: '무한_스크롤_미리_불러오기_zenn.md',
      publishInfo: '무한_스크롤_미리_불러오기_발행정보.md',
      thumbnail: '무한_스크롤_미리_불러오기_썸네일.png',
      evidence: 'evidence.json',
      verification: 'verification.json',
    });
  });
});
