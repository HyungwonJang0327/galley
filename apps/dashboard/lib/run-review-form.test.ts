import { describe, it, expect } from 'vitest';
import {
  collectReviewAnswers,
  describeAnswerPlan,
  describeChoice,
  initialReviewForm,
} from './run-review-form';
import type { ReviewQuestionView } from './run-review';

const q = (
  id: string,
  source: ReviewQuestionView['source'],
  previousAnswer?: ReviewQuestionView['previousAnswer'],
): ReviewQuestionView => ({
  id,
  source,
  text: `${id} 질문`,
  line: 1,
  ...(previousAnswer === undefined ? {} : { previousAnswer }),
});

const QUESTIONS = [q('c1', 'comment'), q('u1', 'unsupported'), q('u2', 'unsupported')];

describe('initialReviewForm', () => {
  it('기본은 "답 안 함", 반영되지 못한 답이 있으면 그대로 채운다', () => {
    expect(
      initialReviewForm([
        q('c1', 'comment', { id: 'c1', kind: 'fill', text: '3만 건' }),
        q('u1', 'unsupported'),
      ]),
    ).toEqual({ choices: { c1: 'fill', u1: 'none' }, texts: { c1: '3만 건', u1: '' } });
  });
});

describe('collectReviewAnswers', () => {
  it('답한 질문만 모으고 채움 글은 앞뒤 공백을 걷는다', () => {
    expect(
      collectReviewAnswers(
        QUESTIONS,
        {
          choices: { c1: 'fill', u1: 'none', u2: 'delete' },
          texts: { c1: '  3만 건 ', u2: '남은 글' },
        },
        2000,
      ),
    ).toEqual({
      ok: true,
      answers: [
        { id: 'c1', kind: 'fill', text: '3만 건' },
        { id: 'u2', kind: 'delete' },
      ],
    });
  });

  it.each([
    ['하나도 답하지 않음', { choices: {}, texts: {} }, '하나 이상'],
    ['채움이 비었음', { choices: { c1: 'fill' as const }, texts: { c1: '  ' } }, '내용을 입력'],
    [
      '채움이 김',
      { choices: { c1: 'fill' as const }, texts: { c1: '가'.repeat(11) } },
      '10자 이하',
    ],
  ])('%s → 보내지 않는다', (_name, state, phrase) => {
    const result = collectReviewAnswers(QUESTIONS, state, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(phrase);
  });
});

describe('describeChoice', () => {
  it('주석 질문의 삭제는 주석만 지운다고, 근거 없음 문장의 삭제는 문장을 뺀다고 알린다', () => {
    expect(describeChoice('comment', 'delete')).toContain('주석만');
    expect(describeChoice('unsupported', 'delete')).toContain('본문에서 뺍니다');
    expect(describeChoice('unsupported', 'keep')).toContain('다시 묻지 않습니다');
    expect(describeChoice('comment', 'none')).toBeNull();
  });
});

describe('describeAnswerPlan', () => {
  it('모름·주석 삭제만이면 모델을 부르지 않는다', () => {
    expect(
      describeAnswerPlan(QUESTIONS, [
        { id: 'c1', kind: 'delete' },
        { id: 'u1', kind: 'keep' },
      ]),
    ).toEqual({
      counts: '모름 1 · 삭제 1',
      costs: false,
      effect: expect.stringContaining('모델을 부르지 않고'),
    });
  });

  it('근거 없음 문장의 삭제는 글 내용을 바꾼다 — 근거 검증·링크드인·Zenn이 돈다', () => {
    const plan = describeAnswerPlan(QUESTIONS, [{ id: 'u1', kind: 'delete' }]);
    expect(plan.costs).toBe(true);
    expect(plan.effect).toMatch(/^근거 검증을 다시/);
  });

  it('채움이 있으면 본문도 고친다', () => {
    const plan = describeAnswerPlan(QUESTIONS, [{ id: 'c1', kind: 'fill', text: 'x' }]);
    expect(plan).toMatchObject({ counts: '채움 1', costs: true });
    expect(plan.effect).toContain('본문은 답한 문단만');
  });
});
