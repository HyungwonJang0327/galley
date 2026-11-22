import { describe, test, expect } from 'vitest';
import { parseReviewComments, selectReviewQuestions } from './questions.ts';

const comment = (text: string) => `<!-- [확인 필요] ${text} -->`;

const BODY = [
  '# 제목', // 1 — 문단 0
  '', // 2
  '서론 문단.', // 3 — 문단 1
  comment('응답 시간이 실제로 얼마나 줄었나요? — 근거에 측정값이 없음'), // 4 — 문단 1
  '', // 5
  '둘째 문단.', // 6 — 문단 2
  '', // 7
  comment('CHECK 제약 검토 여부는 근거에 없음'), // 8 — 문단 3(주석만)
  '', // 9
  '<!-- [삽화] illust1_a.png — 여기: 표 다음 -->', // 10 — 문단 4
  '', // 11
  '셋째 문단.', // 12 — 문단 5
].join('\n');

describe('parseReviewComments', () => {
  test('고정 형식은 줄표 앞이 질문·뒤가 사유, 옛 형식(줄표 없음)은 전체가 질문 — 본문 순서·줄 번호', () => {
    expect(parseReviewComments(BODY)).toEqual([
      { question: '응답 시간이 실제로 얼마나 줄었나요?', reason: '근거에 측정값이 없음', line: 4 },
      { question: 'CHECK 제약 검토 여부는 근거에 없음', line: 8 },
    ]);
  });

  test('첫 줄표에서만 나누고, 여러 줄 주석은 한 줄로 접고, 공백 없는 줄표·빈 주석·다른 주석은 건드리지 않는다', () => {
    expect(
      parseReviewComments(
        [
          comment('A — B — C'),
          '<!-- [확인 필요] 여러 줄\n  질문인가요?\n  — 사유도\n  여러 줄 -->',
          comment('2024—2025 범위가 맞나요?'),
          comment(''),
          comment('   — 사유만 있음'),
          '<!--[확인 필요]붙여 씀-->',
          '<!-- [삽화] illust1_a.png — 여기 -->',
          '<!-- 확인 필요 아님 -->',
        ].join('\n'),
      ),
    ).toEqual([
      { question: 'A', reason: 'B — C', line: 1 },
      { question: '여러 줄 질문인가요?', reason: '사유도 여러 줄', line: 2 },
      { question: '2024—2025 범위가 맞나요?', line: 6 },
      { question: '붙여 씀', line: 9 },
    ]);
  });
});

describe('selectReviewQuestions', () => {
  const claim = (line: number, text: string, status = 'unsupported', note?: string) => ({
    text,
    status,
    line,
    ...(note === undefined ? {} : { note }),
  });

  test('주석 먼저 → 근거 없음, 각각 본문 순서. 앵커는 문단 번호와 줄', () => {
    const result = selectReviewQuestions(BODY, [
      claim(12, '셋째 문단의 주장', 'unsupported', '  설계 이유가\n근거에 없음 '),
      claim(6, '근거 있는 주장', 'supported'),
      claim(6, '불확실한 주장', 'uncertain'),
      claim(3, '서론의 주장'),
    ]);
    expect(result).toEqual({
      version: 1,
      questions: [
        {
          id: 'c1',
          source: 'comment',
          question: '응답 시간이 실제로 얼마나 줄었나요?',
          reason: '근거에 측정값이 없음',
          anchor: { paragraph: 1, line: 4 },
        },
        {
          id: 'c2',
          source: 'comment',
          question: 'CHECK 제약 검토 여부는 근거에 없음',
          anchor: { paragraph: 3, line: 8 },
        },
        {
          id: 'u1',
          source: 'unsupported',
          question: '서론의 주장',
          anchor: { paragraph: 1, line: 3 },
        },
      ],
      more: [
        {
          id: 'u2',
          source: 'unsupported',
          question: '셋째 문단의 주장',
          reason: '설계 이유가 근거에 없음',
          anchor: { paragraph: 5, line: 12 },
        },
      ],
    });
  });

  test('상위 3개만 질문, 넘치면 버리지 않고 more — 주석이 3개를 넘으면 근거 없음은 전부 more', () => {
    const body = ['a', 'b', 'c', 'd'].map((q) => `문단 ${q}\n${comment(q)}`).join('\n\n');
    const result = selectReviewQuestions(body, [claim(1, '주장')]);
    expect(result.questions.map((q) => q.id)).toEqual(['c1', 'c2', 'c3']);
    expect(result.more.map((q) => q.id)).toEqual(['c4', 'u1']);
    expect(result.more[0]!.anchor).toEqual({ paragraph: 3, line: 11 });
  });

  test('주석도 근거 없음도 없으면 빈 목록, 같은 줄의 주장은 리포트 순서, 빈 주장은 버린다', () => {
    expect(selectReviewQuestions('본문', [claim(1, '주장', 'supported')])).toEqual({
      version: 1,
      questions: [],
      more: [],
    });
    expect(
      selectReviewQuestions('한 줄', [claim(1, '뒤'), claim(1, ' '), claim(1, '앞')]).questions.map(
        (q) => q.question,
      ),
    ).toEqual(['뒤', '앞']);
  });

  test('상한을 바꿀 수 있고 0이면 전부 more', () => {
    const result = selectReviewQuestions(BODY, [], 0);
    expect(result.questions).toEqual([]);
    expect(result.more).toHaveLength(2);
    expect(selectReviewQuestions(BODY, [], 1).questions).toHaveLength(1);
  });
});
