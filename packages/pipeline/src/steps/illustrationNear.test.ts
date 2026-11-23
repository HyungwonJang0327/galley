import { describe, expect, it } from 'vitest';
import { illustrationsNearChanges, locateIllustrations } from './illustrationNear.ts';

const body = (...paragraphs: string[]) => `${paragraphs.join('\n\n')}\n`;
const ILLUST1 = '<!-- [삽화] illust1_feed.png — 여기: 서론 다음 -->';
const ILLUST2 = '<!-- [삽화] illust2_table.png — 여기: 표 다음 -->';

const BASE = [
  '# 제목',
  '서론 문단.',
  ILLUST1,
  '첫 절 문단.',
  '둘째 문단.',
  '셋째 문단.',
  ILLUST2,
  '맺음.',
];

describe('illustrationsNearChanges', () => {
  it('바뀐 문단이 없으면 빈 목록', () => {
    expect(illustrationsNearChanges(body(...BASE), body(...BASE))).toEqual([]);
  });

  it('삽화 주석 바로 앞 문단이 바뀌면 그 삽화', () => {
    const next = BASE.map((p) => (p === '서론 문단.' ? '서론을 고친 문단.' : p));
    expect(illustrationsNearChanges(body(...BASE), body(...next))).toEqual([
      { name: 'illust1_feed', paragraph: 2, line: 5 },
    ]);
  });

  it('삽화 주석 바로 뒤 문단이 바뀌어도 그 삽화', () => {
    const next = BASE.map((p) => (p === '맺음.' ? '고친 맺음.' : p));
    expect(illustrationsNearChanges(body(...BASE), body(...next)).map((i) => i.name)).toEqual([
      'illust2_table',
    ]);
  });

  it('두 문단 떨어진 곳이 바뀌면 고르지 않는다', () => {
    const next = BASE.map((p) => (p === '둘째 문단.' ? '고친 둘째 문단.' : p));
    expect(illustrationsNearChanges(body(...BASE), body(...next))).toEqual([]);
  });

  it('주석 앞 문단이 통째로 빠져도 고른다 — 자리는 고친 본문 기준', () => {
    const next = BASE.filter((p) => p !== '셋째 문단.');
    expect(illustrationsNearChanges(body(...BASE), body(...next))).toEqual([
      { name: 'illust2_table', paragraph: 5, line: 11 },
    ]);
  });

  it('앞에서 문단이 늘어도 뒤쪽 자리를 밀린 만큼 맞춰 본다', () => {
    const next = [...BASE];
    next.splice(1, 1, '서론 하나.', '서론 둘.', '서론 셋.'); // 서론 1문단 → 3문단
    const near = illustrationsNearChanges(body(...BASE), body(...next));
    expect(near.map((i) => i.name)).toEqual(['illust1_feed']);
  });

  it('[확인 필요] 주석만 지운 문단은 바뀐 것이 아니다', () => {
    const before = BASE.map((p) =>
      p === '서론 문단.' ? '서론 문단. <!-- [확인 필요] 몇 건? — 로그 없음 -->' : p,
    );
    expect(illustrationsNearChanges(body(...before), body(...BASE))).toEqual([]);
  });

  it('삽화 주석이 문단 안에 붙어 있어도 그 문단이 바뀌면 고른다', () => {
    const before = body('# 제목', `서론 문단.\n${ILLUST1}`, '첫 절.');
    const after = body('# 제목', `고친 서론.\n${ILLUST1}`, '첫 절.');
    expect(illustrationsNearChanges(before, after)).toEqual([
      { name: 'illust1_feed', paragraph: 1, line: 4 },
    ]);
  });
});

describe('locateIllustrations', () => {
  it('이름으로 자리를 찾고 본문에 없는 이름은 뺀다', () => {
    expect(locateIllustrations(body(...BASE), ['illust2_table', 'illust9_gone'])).toEqual([
      { name: 'illust2_table', paragraph: 6, line: 13 },
    ]);
  });
});
