import { describe, test, expect } from 'vitest';
import {
  applyVelogSeries,
  applyZennSeries,
  renderSeriesHeader,
  renderSeriesSystemLine,
  stripSeriesLines,
  toSeriesStepInfo,
  VELOG_LINK_PLACEHOLDER,
  type SeriesStepInfo,
} from './series.ts';
import type { SeriesContext } from '../queue/seriesContext.ts';

const context: SeriesContext = {
  key: 'A',
  name: '앱 만들기',
  nameJa: 'アプリをつくる',
  episodes: [
    {
      topicId: 't1',
      episodeNo: 1,
      title: '첫 편',
      status: '완료',
      velogUrl: 'https://velog.io/@x/first',
      alreadyPublished: false,
    },
    { topicId: 't2', episodeNo: 2, title: '둘째 편', status: '대기', alreadyPublished: false },
    { episodeNo: 3, title: '셋째 편', status: '후보', alreadyPublished: false },
  ],
};

const info = (topicId: string) => {
  const found = toSeriesStepInfo(context, topicId);
  if (found === undefined) throw new Error(`${topicId} 편 없음`);
  return found;
};

describe('toSeriesStepInfo', () => {
  test('1편·중간·마지막 편', () => {
    expect(info('t1')).toEqual({
      name: '앱 만들기',
      nameJa: 'アプリをつくる',
      episodeNo: 1,
      total: 3,
      next: { title: '둘째 편' },
      alreadyPublished: false,
    });
    expect(info('t2')).toMatchObject({
      episodeNo: 2,
      previous: { title: '첫 편', url: 'https://velog.io/@x/first' },
      next: { title: '셋째 편' },
    });
    const last = toSeriesStepInfo(
      { ...context, episodes: context.episodes.map((e, i) => ({ ...e, topicId: `e${i}` })) },
      'e2',
    );
    expect(last).toMatchObject({ episodeNo: 3, previous: { title: '둘째 편' } });
    expect(last?.next).toBeUndefined();
    expect(last?.previous?.url).toBeUndefined();
  });

  test('편 목록에 이 주제가 없으면 undefined(시리즈가 아닌 글로)', () => {
    expect(toSeriesStepInfo(context, 'nope')).toBeUndefined();
  });
});

describe('renderSeriesHeader', () => {
  test('1편은 링크 없이, 이전 편 URL이 없으면 자리표시자', () => {
    expect(renderSeriesHeader(info('t1'))).toBe('> 앱 만들기 시리즈 1편.');
    expect(renderSeriesHeader(info('t2'))).toBe(
      '> 앱 만들기 시리즈 2편. [이전 편: 첫 편](https://velog.io/@x/first)',
    );
    expect(renderSeriesHeader({ ...info('t2'), previous: { title: '첫 편' } })).toBe(
      `> 앱 만들기 시리즈 2편. [이전 편: 첫 편](${VELOG_LINK_PLACEHOLDER})`,
    );
  });

  test('이전 편이 (기존 글)이어도 제목·URL은 그대로 쓴다', () => {
    const prevPublished: SeriesContext = {
      ...context,
      episodes: [
        {
          topicId: 'old',
          episodeNo: 6,
          title: '세션 다시 보기',
          status: '후보',
          velogUrl: 'https://velog.io/@x/session',
          alreadyPublished: true,
        },
        { topicId: 'new', episodeNo: 7, title: '마무리', status: '대기', alreadyPublished: false },
      ],
    };
    const got = toSeriesStepInfo(prevPublished, 'new');
    expect(got && renderSeriesHeader(got)).toBe(
      '> 앱 만들기 시리즈 7편. [이전 편: 세션 다시 보기](https://velog.io/@x/session)',
    );
    expect(toSeriesStepInfo(prevPublished, 'old')?.alreadyPublished).toBe(true);
  });
});

test('renderSeriesSystemLine은 편 번호·이전 편 제목을 알리고 안내 줄은 쓰지 말라고 한다', () => {
  const line = renderSeriesSystemLine(info('t2'));
  expect(line).toContain('"앱 만들기" 시리즈 2편');
  expect(line).toContain('(이전 편: 첫 편)');
  expect(line).toContain('시스템이 붙이므로 쓰지 않습니다');
});

const VELOG = `# 인증 붙이기

도입 문단.

## 결과

결과 문단.

\`\`\`ts
# 펜스 안 주석
\`\`\`

## 회고

회고 문단.
`;

describe('applyVelogSeries', () => {
  test('H1 끝에 시리즈명 N편, 그 아래 인용 줄, 결과 절 끝에 다음 편', () => {
    expect(applyVelogSeries(VELOG, info('t2'))).toBe(`# 인증 붙이기 | 앱 만들기 2편

> 앱 만들기 시리즈 2편. [이전 편: 첫 편](https://velog.io/@x/first)

도입 문단.

## 결과

결과 문단.

\`\`\`ts
# 펜스 안 주석
\`\`\`

다음 편: 셋째 편

## 회고

회고 문단.
`);
  });

  test('마지막 편은 다음 편 줄이 없고, 결과 절이 없으면 맨 끝에', () => {
    const last = { ...info('t2'), next: undefined } satisfies SeriesStepInfo;
    expect(applyVelogSeries(VELOG, last)).not.toContain('다음 편:');
    expect(applyVelogSeries('# 제목\n\n본문.\n', info('t1'))).toBe(
      '# 제목 | 앱 만들기 1편\n\n> 앱 만들기 시리즈 1편.\n\n본문.\n\n다음 편: 둘째 편\n',
    );
  });

  test('H1이 없으면 인용 줄을 맨 앞에', () => {
    expect(applyVelogSeries('본문만.\n', { ...info('t1'), next: undefined })).toBe(
      '> 앱 만들기 시리즈 1편.\n\n본문만.\n',
    );
  });
});

describe('stripSeriesLines', () => {
  test('벨로그 시리즈 표기를 떼면 원래 본문으로 돌아간다', () => {
    expect(stripSeriesLines(applyVelogSeries(VELOG, info('t2')))).toBe(VELOG);
    expect(stripSeriesLines(applyVelogSeries(VELOG, info('t1')))).toBe(VELOG);
  });

  test('펜스 안과 시리즈가 아닌 본문은 건드리지 않는다', () => {
    const fenced = '# 제목\n\n```\n다음 편: 코드 안\n> 앱 시리즈 1편.\n```\n';
    expect(stripSeriesLines(fenced)).toBe(fenced);
    expect(stripSeriesLines(VELOG)).toBe(VELOG);
  });
});

describe('applyZennSeries', () => {
  test('はじめに 첫 문장 앞에 시리즈 문장(ja 이름)', () => {
    expect(applyZennSeries('## はじめに\n\n最初の文です。\n\n## 次\n', info('t2'))).toBe(
      '## はじめに\n\nアプリをつくるシリーズの第2回です。最初の文です。\n\n## 次\n',
    );
  });

  test('ja: 없으면 한글명, 절 첫 내용이 문단이 아니면 소제목 아래 문단으로', () => {
    const noJa = { ...info('t1'), nameJa: undefined };
    expect(applyZennSeries('## はじめに\n\n```ts\ncode\n```\n', noJa)).toBe(
      '## はじめに\n\n앱 만들기シリーズの第1回です。\n\n```ts\ncode\n```\n',
    );
  });

  test('はじめに가 없으면 본문 맨 앞 문단으로', () => {
    expect(applyZennSeries('本文。\n', info('t1'))).toBe(
      'アプリをつくるシリーズの第1回です。\n\n本文。\n',
    );
  });
});
