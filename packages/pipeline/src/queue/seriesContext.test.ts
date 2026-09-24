import { describe, test, expect } from 'vitest';
import { buildSeriesContext, seriesNameJa, type SeriesEpisodeRow } from './seriesContext.ts';
import { HOLD_REASON_REMOVED } from './importQueue.ts';
import type { SeriesDef } from './queueFile.ts';

const def = (key: string, name: string, note?: string): SeriesDef => ({
  key,
  name,
  ...(note === undefined ? {} : { note }),
  category: '시리즈',
  position: 0,
});

let seq = 0;
const row = (over: Partial<SeriesEpisodeRow> & Pick<SeriesEpisodeRow, 'title' | 'episodeNo'>) => ({
  id: `t${++seq}`,
  status: '대기',
  order: 0,
  missingSince: null,
  holdReason: null,
  ...over,
});

describe('seriesNameJa', () => {
  test('쉼표로 나뉜 메모에서 ja: 항을 읽는다', () => {
    expect(seriesNameJa('예정, ja: デザインシステム')).toBe('デザインシステム');
    expect(seriesNameJa('JA:アプリ，2026.09')).toBe('アプリ');
  });

  test('없거나 비었으면 undefined', () => {
    expect(seriesNameJa(undefined)).toBeUndefined();
    expect(seriesNameJa('커밋 175')).toBeUndefined();
    expect(seriesNameJa('ja:  ')).toBeUndefined();
  });
});

describe('buildSeriesContext', () => {
  test('정의 줄이 없으면 SERIES_NOT_DEFINED(이름을 지어내지 않는다)', () => {
    expect(buildSeriesContext('Z', [def('A', '앱')], [])).toEqual({
      ok: false,
      code: 'SERIES_NOT_DEFINED',
    });
  });

  test('이름·일본어 표기는 정의 줄, 편은 편 번호순, 완료 편만 슬러그·URL', () => {
    const result = buildSeriesContext(
      'B',
      [def('A', '다른 앱'), def('B', '링크 앱 만들기', '107 커밋, ja: リンクアプリ')],
      [
        row({ title: '둘째 편 (linklet)', episodeNo: 2, status: '후보', order: 4 }),
        row({
          title:
            '(기존 글) 세션 다시 보기 (2025 글 후속, posts/session-later) https://velog.io/@x/session',
          episodeNo: 6,
          status: '완료',
        }),
        row({ title: '첫 편', episodeNo: 1, status: '완료' }),
        row({ title: '대기 편 (posts/not-done)', episodeNo: 3 }),
      ],
    );

    expect(result).toEqual({
      ok: true,
      series: {
        key: 'B',
        name: '링크 앱 만들기',
        nameJa: 'リンクアプリ',
        episodes: [
          {
            topicId: expect.any(String),
            episodeNo: 1,
            title: '첫 편',
            status: '완료',
            alreadyPublished: false,
          },
          {
            topicId: expect.any(String),
            episodeNo: 2,
            title: '둘째 편',
            status: '후보',
            alreadyPublished: false,
          },
          {
            topicId: expect.any(String),
            episodeNo: 3,
            title: '대기 편',
            status: '대기',
            alreadyPublished: false,
          },
          {
            topicId: expect.any(String),
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

  test('파일에서 사라진 행(확인 대기·자동 보류)은 편으로 세지 않는다 — 직접 보류한 편은 센다', () => {
    const result = buildSeriesContext(
      'A',
      [def('A', '앱')],
      [
        row({ title: '남은 편', episodeNo: 1 }),
        row({ title: '확인 대기', episodeNo: 2, missingSince: new Date() }),
        row({ title: '자동 보류', episodeNo: 3, status: '보류', holdReason: HOLD_REASON_REMOVED }),
        row({ title: '직접 보류', episodeNo: 4, status: '보류' }),
      ],
    );
    expect(result.ok && result.series.episodes.map((e) => e.title)).toEqual([
      '남은 편',
      '직접 보류',
    ]);
  });

  test('편 번호가 겹치면 파일 순서(섹션 → 줄)로 결정적으로', () => {
    const result = buildSeriesContext(
      'A',
      [def('A', '앱')],
      [
        row({ title: '후보 쪽', episodeNo: 1, status: '후보', order: 0 }),
        row({ title: '대기 둘째 줄', episodeNo: 1, order: 1 }),
        row({ title: '대기 첫 줄', episodeNo: 1, order: 0 }),
      ],
    );
    expect(result.ok && result.series.episodes.map((e) => e.title)).toEqual([
      '대기 첫 줄',
      '대기 둘째 줄',
      '후보 쪽',
    ]);
  });

  test('정의 줄만 있고 편이 없는 시리즈도 유효하다', () => {
    expect(buildSeriesContext('D', [def('D', '패키지')], [])).toEqual({
      ok: true,
      series: { key: 'D', name: '패키지', episodes: [] },
    });
  });
});
