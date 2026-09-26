import { describe, test, expect } from 'vitest';
import type { EvidencePointers } from '../evidence/bundle.ts';
import {
  parsePublishTitle,
  renderChecklistSection,
  renderEvidenceSection,
  renderPublishInfo,
  type PublishInfoInput,
} from './publishInfo.ts';
import type { SeriesStepInfo } from './series.ts';

const EVIDENCE: EvidencePointers = {
  version: 1,
  runId: 'run_1',
  topicId: 't1',
  topicSlug: 'infinite-scroll',
  collectedAt: '2026-09-26T00:00:00.000Z',
  items: [
    {
      analysisId: 'a1',
      commit: 'abcdef1234567890',
      path: 'src/scroll.ts',
      lineRange: { start: 10, end: 12 },
      date: '2024-03-05T10:00:00+09:00',
      note: 'IntersectionObserver로 다음 페이지 ',
      source: 'linked',
      redacted: true,
      truncated: false,
    },
    {
      commit: '0123456789abcdef',
      path: 'src/api.ts',
      lineRange: { start: 7, end: 7 },
      date: '2024-04-01T00:00:00.000Z',
      source: 'discovered',
      redacted: false,
      truncated: true,
    },
  ],
  analyses: [{ id: 'a1', kind: 'area', title: 'src 영역', summary: '스크롤·API 모듈.' }],
  unreadable: 0,
  filtered: true,
};

const INPUT: PublishInfoInput = {
  title: '무한 스크롤 미리 불러오기',
  slug: 'infinite-scroll',
  intro: ' 피드 끝에 닿기 전에 다음 페이지를 불러온 이야기. ',
  tags: ['React', '무한스크롤'],
  zenn: { title: '無限スクロールの先読み', emoji: '📝', type: 'tech', topics: [] },
  evidence: EVIDENCE,
  thumbnailFile: '무한_스크롤_미리_불러오기_썸네일.png',
};

const SERIES: SeriesStepInfo = {
  name: '결제 전환',
  episodeNo: 2,
  total: 5,
  previous: { title: '토스에서 나이스페이로' },
  next: { title: '정산 대사' },
  alreadyPublished: false,
};

describe('renderEvidenceSection', () => {
  test('포인터 한 줄씩 — sha 7자·경로:라인·날짜만·note', () => {
    expect(renderEvidenceSection(EVIDENCE)).toBe(
      [
        '## 근거',
        '',
        '- abcdef1 src/scroll.ts:L10-12 (2024-03-05) — IntersectionObserver로 다음 페이지',
        '- 0123456 src/api.ts:L7 (2024-04-01)',
        '',
      ].join('\n'),
    );
  });

  test('0건이면 "근거 없음", 못 읽은 포인터는 마지막 줄에 센다', () => {
    expect(renderEvidenceSection({ ...EVIDENCE, items: [], unreadable: 2 })).toBe(
      '## 근거\n\n근거 없음\n\n읽지 못한 포인터 2개\n',
    );
  });

  test('조각(snippet)이 들어 있어도 출력에 나오지 않는다 — 타입이 막지만 런타임도 확인', () => {
    const leaked = {
      ...EVIDENCE,
      items: [{ ...EVIDENCE.items[0]!, snippet: 'const SECRET = 1;' }],
    } as unknown as EvidencePointers;
    expect(renderEvidenceSection(leaked)).not.toContain('SECRET');
  });
});

describe('renderChecklistSection', () => {
  test('항목이 없으면 절이 없다', () => {
    expect(renderChecklistSection([])).toBe('');
  });

  test('id마다 한국어 체크 항목 한 줄', () => {
    expect(
      renderChecklistSection([
        { id: 'velog-series-add', params: { seriesName: '결제 전환' } },
        { id: 'velog-previous-link', params: { previousTitle: '토스에서 나이스페이로' } },
      ]),
    ).toBe(
      [
        '## 발행 체크리스트',
        '',
        '- [ ] 벨로그에서 이 글을 "결제 전환" 시리즈에 추가',
        '- [ ] 본문의 이전 편 링크 자리표시자를 "토스에서 나이스페이로" 글 URL로 채움',
        '',
      ].join('\n'),
    );
  });
});

describe('renderPublishInfo', () => {
  test('시리즈 아닌 글 — 기존 파일 절 순서 + 근거, 시리즈·체크리스트 절 없음', () => {
    const text = renderPublishInfo(INPUT);
    expect(text).toBe(
      [
        '# 발행 정보 — 무한 스크롤 미리 불러오기',
        '',
        '## 포스트 소개 (150자 이내)',
        '',
        '피드 끝에 닿기 전에 다음 페이지를 불러온 이야기.',
        '',
        '## URL 슬러그',
        '',
        'infinite-scroll',
        '',
        '## 썸네일',
        '',
        '무한_스크롤_미리_불러오기_썸네일.png (미생성 — 썸네일 단계 전)',
        '',
        '## 태그',
        '',
        'React',
        '무한스크롤',
        '',
        '## Zenn (일본어판)',
        '',
        'タイトル: 無限スクロールの先読み',
        'emoji: 📝',
        'type: tech',
        'topics: (검수 때 채움)',
        '',
        '## 근거',
        '',
        '- abcdef1 src/scroll.ts:L10-12 (2024-03-05) — IntersectionObserver로 다음 페이지',
        '- 0123456 src/api.ts:L7 (2024-04-01)',
        '',
      ].join('\n'),
    );
    expect(text).not.toContain('## 벨로그 시리즈');
    expect(text).not.toContain('## 발행 체크리스트');
  });

  test('시리즈 편 — 태그 뒤에 시리즈 절, 끝에 체크리스트', () => {
    const text = renderPublishInfo({ ...INPUT, series: SERIES });
    const at = (s: string) => text.indexOf(s);
    expect(text).toContain('## 벨로그 시리즈\n\n결제 전환 · 2/5편\n');
    expect(at('## 태그')).toBeLessThan(at('## 벨로그 시리즈'));
    expect(at('## 벨로그 시리즈')).toBeLessThan(at('## Zenn'));
    expect(text.endsWith('글 URL로 채움\n')).toBe(true);
  });

  test('소개·태그가 비면 "(작성 필요)" 자리표시자, topics가 있으면 쉼표로', () => {
    const text = renderPublishInfo({
      ...INPUT,
      intro: '  ',
      tags: [],
      zenn: { ...INPUT.zenn, topics: ['react', '個人開発'] },
    });
    expect(text).toContain('## 포스트 소개 (150자 이내)\n\n(작성 필요)\n');
    expect(text).toContain('## 태그\n\n(작성 필요)\n');
    expect(text).toContain('topics: react, 個人開発');
  });

  test('절 사이 빈 줄 하나, 빈 줄 둘이 연속되지 않는다', () => {
    expect(renderPublishInfo({ ...INPUT, series: SERIES })).not.toMatch(/\n\n\n/);
  });
});

describe('parsePublishTitle', () => {
  test('첫 줄에서 글 제목을 읽는다(렌더 결과와 왕복)', () => {
    expect(parsePublishTitle(renderPublishInfo(INPUT))).toBe('무한 스크롤 미리 불러오기');
    expect(parsePublishTitle('﻿# 발행 정보 — 제목\r\n본문')).toBe('제목');
  });

  test('형식이 다르거나 제목이 비면 undefined', () => {
    expect(parsePublishTitle('# 제목\n')).toBeUndefined();
    expect(parsePublishTitle('# 발행 정보 — \n')).toBeUndefined();
    expect(parsePublishTitle('')).toBeUndefined();
  });
});
