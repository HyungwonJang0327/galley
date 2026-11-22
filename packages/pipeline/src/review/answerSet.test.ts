import { describe, test, expect } from 'vitest';
import {
  REVIEW_ANSWER_MAX_LENGTH,
  REVIEW_ANSWERS_MAX,
  answersChangeContent,
  buildReviewAnswerSet,
  parseReviewAnswerSet,
  renderReviewAnswerSet,
  type ReviewAnswerItem,
} from './answerSet.ts';
import type { ReviewQuestion } from './questions.ts';

const comment: ReviewQuestion = {
  id: 'c1',
  source: 'comment',
  question: 'CHECK 제약을 검토했나요?',
  reason: '근거에 없음',
  anchor: { paragraph: 12, line: 40 },
};
const claim: ReviewQuestion = {
  id: 'u1',
  source: 'unsupported',
  question: '응답 시간이 절반으로 줄었다.',
  anchor: { paragraph: 3, line: 7 },
};
const fill = (question: ReviewQuestion, text: string): ReviewAnswerItem => ({
  question,
  answer: { id: question.id, kind: 'fill', text },
});
const keep = (question: ReviewQuestion): ReviewAnswerItem => ({
  question,
  answer: { id: question.id, kind: 'keep' },
});
const del = (question: ReviewQuestion): ReviewAnswerItem => ({
  question,
  answer: { id: question.id, kind: 'delete' },
});

describe('buildReviewAnswerSet', () => {
  test('질문·답을 순서대로 담고 채움 글의 앞뒤 공백을 걷는다', () => {
    expect(buildReviewAnswerSet([fill(comment, '  검토했고 넣지 않았다 \n'), del(claim)])).toEqual({
      ok: true,
      set: {
        version: 1,
        items: [fill(comment, '검토했고 넣지 않았다'), del(claim)],
      },
    });
  });

  test('답이 없거나 너무 많으면 거절한다', () => {
    expect(buildReviewAnswerSet([])).toEqual({ ok: false, code: 'ANSWERS_EMPTY' });
    const many = Array.from({ length: REVIEW_ANSWERS_MAX + 1 }, (_, i) =>
      keep({ ...claim, id: `u${i + 1}` }),
    );
    expect(buildReviewAnswerSet(many)).toEqual({ ok: false, code: 'ANSWERS_TOO_MANY' });
  });

  test('질문과 다른 id·같은 질문에 답 둘·빈 채움은 ANSWER_INVALID, 긴 채움은 ANSWER_TOO_LONG', () => {
    expect(
      buildReviewAnswerSet([{ question: comment, answer: { id: 'u1', kind: 'keep' } }]),
    ).toEqual({ ok: false, code: 'ANSWER_INVALID' });
    expect(buildReviewAnswerSet([keep(claim), del(claim)])).toEqual({
      ok: false,
      code: 'ANSWER_INVALID',
    });
    expect(buildReviewAnswerSet([fill(comment, '   ')])).toEqual({
      ok: false,
      code: 'ANSWER_INVALID',
    });
    expect(buildReviewAnswerSet([fill(comment, '가'.repeat(REVIEW_ANSWER_MAX_LENGTH))]).ok).toBe(
      true,
    );
    expect(
      buildReviewAnswerSet([fill(comment, '가'.repeat(REVIEW_ANSWER_MAX_LENGTH + 1))]),
    ).toEqual({ ok: false, code: 'ANSWER_TOO_LONG' });
  });
});

describe('answersChangeContent', () => {
  test('채움이 있거나 근거 없음 문장을 빼면 글 내용이 바뀐다', () => {
    expect(answersChangeContent([keep(claim), fill(comment, '사실')])).toBe(true);
    expect(answersChangeContent([del(claim)])).toBe(true);
  });

  test('모름과 주석 질문의 삭제는 주석만 지워 내용이 그대로다', () => {
    expect(answersChangeContent([keep(comment), keep(claim), del(comment)])).toBe(false);
  });
});

describe('저장 형식', () => {
  test('쓰고 다시 읽으면 같다 — 사유가 없는 질문은 사유 없이', () => {
    const built = buildReviewAnswerSet([fill(comment, '검토함'), keep(claim)]);
    if (!built.ok) throw new Error('픽스처');
    expect(parseReviewAnswerSet(renderReviewAnswerSet(built.set))).toEqual(built.set);
  });

  test('형태가 어긋나면 undefined — 지어내지 않는다', () => {
    expect(parseReviewAnswerSet('{ nope')).toBeUndefined();
    expect(parseReviewAnswerSet('{"items":{}}')).toBeUndefined();
    expect(parseReviewAnswerSet('{"items":[]}')).toBeUndefined();
    const broken = (patch: object) =>
      JSON.stringify({ version: 1, items: [{ ...fill(comment, '글'), ...patch }] });
    expect(parseReviewAnswerSet(broken({ answer: { id: 'c1', kind: 'rewrite' } }))).toBeUndefined();
    expect(parseReviewAnswerSet(broken({ answer: { id: 'c1', kind: 'fill' } }))).toBeUndefined();
    expect(
      parseReviewAnswerSet(
        broken({ question: { ...comment, anchor: { paragraph: 'x', line: 1 } } }),
      ),
    ).toBeUndefined();
    expect(
      parseReviewAnswerSet(broken({ question: { ...comment, source: 'guess' } })),
    ).toBeUndefined();
  });
});
