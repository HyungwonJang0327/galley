import { describe, test, expect } from 'vitest';
import {
  applyVelogSeries,
  applyZennSeries,
  renderSeriesHeader,
  renderSeriesPublishSection,
  renderSeriesSystemLine,
  seriesZennTitle,
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
  test('벨로그 시리즈 표기를 떼면 원래 본문으로 돌아가고, 두 번 붙여도 한 번 붙인 것과 같다', () => {
    for (const id of ['t1', 't2']) {
      const once = applyVelogSeries(VELOG, info(id));
      expect(stripSeriesLines(once, info(id))).toBe(VELOG);
      expect(applyVelogSeries(once, info(id))).toBe(once);
    }
  });

  test('모델이 스스로 쓴 시리즈 표기(다른 편 번호)도 한 번만 남는다', () => {
    const selfWritten =
      '# 인증 붙이기 | 앱 만들기 9편\n\n> 앱 만들기 시리즈 9편.\n\n도입 문단.\n\n## 결과\n\n결과 문단.\n\n다음 편: 엉뚱한 편\n';
    expect(applyVelogSeries(selfWritten, info('t1'))).toBe(
      '# 인증 붙이기 | 앱 만들기 1편\n\n> 앱 만들기 시리즈 1편.\n\n도입 문단.\n\n## 결과\n\n결과 문단.\n\n다음 편: 둘째 편\n',
    );
  });

  test('다른 이름·다른 위치의 비슷한 줄과 펜스 안은 건드리지 않는다', () => {
    const other =
      '# React | Vue 비교 2편\n\n> 이 글은 React 시리즈 3편.\n\n다음 편: 캐시를 다룬다는 문장.\n\n## 본론\n\n```\n다음 편: 코드 안\n> 앱 만들기 시리즈 1편.\n```\n';
    expect(stripSeriesLines(other, info('t1'))).toBe(other);
  });

  test('제목에 이미 | 가 있거나 시리즈명에 특수문자가 있어도 접미사만 뗀다', () => {
    const odd = { ...info('t1'), name: 'A|B (v2).*' };
    const applied = applyVelogSeries('# 앞 | 뒤\n\n본문.\n', odd);
    expect(applied.split('\n')[0]).toBe('# 앞 | 뒤 | A|B (v2).* 1편');
    expect(stripSeriesLines(applied, odd)).toBe('# 앞 | 뒤\n\n본문.\n');
  });

  test('펜스 안 연속 빈 줄은 보존하고, 네 개 펜스 안의 ``` 줄은 펜스를 닫지 않는다', () => {
    const code =
      '# 제목\n\n````md\n```\n# 안쪽 제목\n```\n\n\ndef a():\n    pass\n````\n\n## 결과\n\n끝.\n';
    const applied = applyVelogSeries(code, info('t1'));
    expect(applied).toContain('```\n\n\ndef a():');
    expect(applied.split('\n')[0]).toBe('# 제목 | 앱 만들기 1편');
    expect(applied).toContain('# 안쪽 제목');
    expect(stripSeriesLines(applied, info('t1'))).toBe(code);
  });
});

describe('applyVelogSeries — 결과 절·링크 텍스트', () => {
  test('번호 붙은 결과 절도 찾는다', () => {
    expect(
      applyVelogSeries('# t\n\n## 5. 결과\n\n끝.\n\n## 회고\n\n회고.\n', info('t1')),
    ).toContain('끝.\n\n다음 편: 둘째 편\n\n## 회고');
  });

  test('이전 편 제목의 대괄호는 이스케이프한다', () => {
    expect(
      renderSeriesHeader({
        ...info('t2'),
        previous: { title: '[A] 첫 편', url: 'https://velog.io/@x/a' },
      }),
    ).toBe('> 앱 만들기 시리즈 2편. [이전 편: \\[A\\] 첫 편](https://velog.io/@x/a)');
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

describe('applyZennSeries — Zenn 블록 경계', () => {
  test.each([
    [':::message\n注意\n:::'],
    ['https://zenn.dev/x'],
    ['@[card](https://zenn.dev/x)'],
    ['$$\na+b\n$$'],
    ['<details><summary>x</summary></details>'],
    ['![図](/img.png)'],
    ['1) 手順'],
    ['    indented code'],
  ])('절 첫 내용이 %j면 소제목 아래 새 문단으로', (first) => {
    expect(applyZennSeries(`## はじめに\n\n${first}\n`, info('t1'))).toBe(
      `## はじめに\n\nアプリをつくるシリーズの第1回です。\n\n${first}\n`,
    );
  });
});

test('seriesZennTitle은 모델이 이미 붙인 (第N回)를 한 번만 남긴다', () => {
  expect(seriesZennTitle('話', info('t2'))).toBe('話 (第2回)');
  expect(seriesZennTitle('話 (第9回)', info('t2'))).toBe('話 (第2回)');
  expect(seriesZennTitle('話（第2回）', info('t2'))).toBe('話 (第2回)');
});

test('renderSeriesPublishSection은 시리즈명 · N/M편, 시리즈가 아니면 절 없음', () => {
  expect(renderSeriesPublishSection(info('t2'))).toBe('## 벨로그 시리즈\n\n앱 만들기 · 2/3편\n');
  expect(renderSeriesPublishSection(undefined)).toBe('');
});
