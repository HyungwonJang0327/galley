import { describe, test, expect } from 'vitest';
import { buildSeriesContext, seriesNameJa, type SeriesTopicRow } from './seriesContext.ts';
import { parseQueue } from './queueFile.ts';

const QUEUE = `## 대기

- [B-3] 대기 편 (posts/not-done)
- [A-1] 다른 시리즈 편

## 후보

### 시리즈

시리즈 A. 다른 앱

시리즈 B. 링크 앱 만들기 (107 커밋, ja: リンクアプリ)
- [B-2] 둘째 편 (linklet)

## 보류

- [B-4] 직접 보류한 편

## 완료

- 2026-09-20 [B-1] 첫 편 (posts/first)
- 2026-09-23 [B-6] (기존 글) 세션 다시 보기 (2025 글 후속, posts/session-later) https://velog.io/@x/session
`;

const rows: SeriesTopicRow[] = [
  { id: 'id-first', title: '첫 편 (posts/first)', status: '완료' },
  { id: 'id-second', title: '둘째 편 (linklet)', status: '후보' },
];

describe('seriesNameJa', () => {
  test('쉼표로 나뉜 메모에서 ja: 항을 읽는다', () => {
    expect(seriesNameJa('예정, ja: デザインシステム')).toBe('デザインシステム');
    expect(seriesNameJa('JA:アプリ，2026.09')).toBe('アプリ');
    expect(seriesNameJa('예정, ja：デザイン')).toBe('デザイン');
  });

  test('없거나 비었으면 undefined', () => {
    expect(seriesNameJa(undefined)).toBeUndefined();
    expect(seriesNameJa('커밋 175')).toBeUndefined();
    expect(seriesNameJa('ja:  ')).toBeUndefined();
  });
});

describe('buildSeriesContext', () => {
  test('정의 줄이 없으면 SERIES_NOT_DEFINED(이름을 지어내지 않는다)', () => {
    expect(buildSeriesContext('Z', parseQueue(QUEUE), rows)).toEqual({
      ok: false,
      code: 'SERIES_NOT_DEFINED',
    });
  });

  test('이름·ja:는 정의 줄, 편은 파일 네 섹션 전부 편 번호순, 완료 편만 슬러그·URL, id는 적재된 줄만', () => {
    expect(buildSeriesContext('B', parseQueue(QUEUE), rows)).toEqual({
      ok: true,
      series: {
        key: 'B',
        name: '링크 앱 만들기',
        nameJa: 'リンクアプリ',
        episodes: [
          {
            topicId: 'id-first',
            episodeNo: 1,
            title: '첫 편',
            status: '완료',
            slug: 'first',
            alreadyPublished: false,
          },
          {
            topicId: 'id-second',
            episodeNo: 2,
            title: '둘째 편',
            status: '후보',
            alreadyPublished: false,
          },
          { episodeNo: 3, title: '대기 편', status: '대기', alreadyPublished: false },
          { episodeNo: 4, title: '직접 보류한 편', status: '보류', alreadyPublished: false },
          {
            episodeNo: 6,
            title: '세션 다시 보기',
            status: '완료',
            slug: 'session-later',
            velogUrl: 'https://velog.io/@x/session',
            alreadyPublished: true,
          },
        ],
      },
    });
  });

  test('파일에 없는 DB 행(사라진 줄·완료 Run으로 남은 행)은 편으로 세지 않는다', () => {
    const stale: SeriesTopicRow[] = [
      ...rows,
      { id: 'id-old', title: '첫 편 옛 제목', status: '완료' },
      { id: 'id-gone', title: '지운 편', status: '보류' },
    ];
    const result = buildSeriesContext('B', parseQueue(QUEUE), stale);
    expect(result.ok && result.series.episodes.map((e) => e.episodeNo)).toEqual([1, 2, 3, 4, 6]);
  });

  test('같은 제목이 여러 줄이면 적재와 같은 짝(같은 섹션 우선)', () => {
    const q = parseQueue(
      '## 대기\n\n- [A-2] 같은 제목\n\n## 후보\n\n- 같은 제목\n\n### 시리즈\n\n시리즈 A. 앱\n',
    );
    const result = buildSeriesContext('A', q, [
      { id: 'id-cand', title: '같은 제목', status: '후보' },
      { id: 'id-wait', title: '[A-2] 같은 제목', status: '대기' },
    ]);
    expect(result.ok && result.series.episodes.map((e) => e.topicId)).toEqual(['id-wait']);
  });

  test('편 번호가 겹치면 파일 순서(섹션 → 줄)로 결정적으로', () => {
    const q = parseQueue(
      '## 대기\n\n- [A-1] 대기 첫 줄\n- [A-1] 대기 둘째 줄\n\n## 후보\n\n### 시리즈\n\n시리즈 A. 앱\n- [A-1] 후보 쪽\n',
    );
    const result = buildSeriesContext('A', q, []);
    expect(result.ok && result.series.episodes.map((e) => e.title)).toEqual([
      '대기 첫 줄',
      '대기 둘째 줄',
      '후보 쪽',
    ]);
  });

  test('정의 줄만 있고 편이 없는 시리즈도 유효하다', () => {
    expect(buildSeriesContext('A', parseQueue(QUEUE), [])).toEqual({
      ok: true,
      series: { key: 'A', name: '다른 앱', episodes: [expect.objectContaining({ episodeNo: 1 })] },
    });
    expect(
      buildSeriesContext('D', parseQueue('## 후보\n\n### 시리즈\n\n시리즈 D. 패키지\n'), []),
    ).toEqual({ ok: true, series: { key: 'D', name: '패키지', episodes: [] } });
  });

  test('발행된 편 경계 — 후보의 (기존 글) 편 URL, 메모 붙은 (기존 글), velog만, posts/ 항만', () => {
    const q = parseQueue(`## 후보

### 시리즈

시리즈 A. 앱
- [A-1] (기존 글, 2025) 옛 편 (posts/old) https://velog.io/@x/old
- [A-2] (기존 글) 깃허브 링크 편 https://github.com/x/y
- [A-3] 새 편 (메모) https://velog.io/@x/not-published

## 완료

- 2026-09-20 [A-4] 경로 편 (https://example.com/posts/abc, drafts/posts/x)
`);
    const result = buildSeriesContext('A', q, []);
    expect(result.ok && result.series.episodes).toEqual([
      {
        episodeNo: 1,
        title: '옛 편',
        status: '후보',
        slug: 'old',
        velogUrl: 'https://velog.io/@x/old',
        alreadyPublished: true,
      },
      { episodeNo: 2, title: '깃허브 링크 편', status: '후보', alreadyPublished: true },
      { episodeNo: 3, title: '새 편', status: '후보', alreadyPublished: false },
      { episodeNo: 4, title: '경로 편', status: '완료', alreadyPublished: false },
    ]);
  });
});
