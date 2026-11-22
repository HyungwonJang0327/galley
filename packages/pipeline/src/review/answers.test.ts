import { describe, test, expect } from 'vitest';
import { applyCodeAnswers, type ReviewAnswer } from './answers.ts';
import { selectReviewQuestions } from './questions.ts';

const BODY = [
  '# 제목', // 1
  '', // 2
  '서론 첫 문장. 근거 없는 서론 주장이다. 서론 끝 문장.', // 3
  '<!-- [확인 필요] 응답 시간이 얼마나 줄었나요? — 측정값 없음 -->', // 4
  '', // 5
  '둘째 문단.', // 6
  '', // 7
  '<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->', // 8
  '', // 9
  '- 목록 하나', // 10
  '- **굵은 주장이다.** 뒤 문장.', // 11
  '', // 12
  '끝 문단 <!-- [확인 필요] 줄 안의 질문? — 사유 --> 이어짐.', // 13
  '', // 14
].join('\n');

const CLAIMS = [
  { text: '근거 없는 서론 주장이다.', status: 'unsupported', line: 3 },
  { text: '**굵은 주장이다.**', status: 'unsupported', line: 11 },
];
const all = () => {
  const selected = selectReviewQuestions(BODY, CLAIMS);
  return [...selected.questions, ...selected.more];
};
const apply = (answers: ReviewAnswer[]) => applyCodeAnswers(BODY, all(), answers);
const lines = (text: string) => text.split('\n');

describe('applyCodeAnswers — 모름', () => {
  test('주석 질문: 그 주석만 지운다 — 줄째 없애고 다른 줄은 그대로, 글 내용은 안 바뀐 것으로 센다', () => {
    const result = apply([{ id: 'c1', kind: 'keep' }]);
    expect(lines(result.body)).toEqual([...lines(BODY).slice(0, 3), ...lines(BODY).slice(4)]);
    expect(result).toMatchObject({
      applied: ['c1'],
      failed: [],
      changed: true,
      contentChanged: false,
    });
  });

  test('혼자 한 문단인 주석을 지우면 빈 줄이 겹치지 않는다, 줄 안의 주석은 앞뒤 글을 한 칸으로 잇는다', () => {
    const result = apply([
      { id: 'c2', kind: 'keep' },
      { id: 'c3', kind: 'keep' },
    ]);
    expect(lines(result.body)).toEqual([
      ...lines(BODY).slice(0, 6),
      '',
      '- 목록 하나',
      '- **굵은 주장이다.** 뒤 문장.',
      '',
      '끝 문단 이어짐.',
      '',
    ]);
    expect(result.applied).toEqual(['c2', 'c3']);
  });

  test('근거 없음 질문: 본문은 그대로 — 그 문장을 두기로 확정한 것', () => {
    expect(apply([{ id: 'u1', kind: 'keep' }])).toEqual({
      body: BODY,
      applied: ['u1'],
      failed: [],
      changed: false,
      contentChanged: false,
    });
  });
});

describe('applyCodeAnswers — 삭제', () => {
  test('근거 없음 질문: 그 문장만 빼고 앞뒤 문장을 한 칸으로 잇는다 — 글 내용이 바뀐 것으로 센다', () => {
    const result = apply([{ id: 'u1', kind: 'delete' }]);
    expect(lines(result.body)[2]).toBe('서론 첫 문장. 서론 끝 문장.');
    expect(lines(result.body)).toHaveLength(lines(BODY).length);
    expect(result).toMatchObject({ applied: ['u1'], changed: true, contentChanged: true });
  });

  test('마크다운 강조가 든 주장도 원문 그대로 찾는다, 줄이 비면 줄째 없앤다', () => {
    expect(lines(apply([{ id: 'u2', kind: 'delete' }]).body)[10]).toBe('- 뒤 문장.');
    const single = '앞 문단.\n\n혼자 있는 주장이다.\n\n뒤 문단.\n';
    const questions = selectReviewQuestions(single, [
      { text: '혼자 있는 주장이다.', status: 'unsupported', line: 3 },
    ]).questions;
    expect(applyCodeAnswers(single, questions, [{ id: 'u1', kind: 'delete' }]).body).toBe(
      '앞 문단.\n\n뒤 문단.\n',
    );
  });

  test('주석 질문의 삭제는 주석만 지운다(뺄 문장을 코드가 알 수 없다) — 글 내용은 그대로', () => {
    const result = apply([{ id: 'c1', kind: 'delete' }]);
    expect(result.body).toBe(apply([{ id: 'c1', kind: 'keep' }]).body);
    expect(result.contentChanged).toBe(false);
  });
});

describe('applyCodeAnswers — 여러 답·실패', () => {
  test('여러 답을 한 번에 — 아래 줄부터 고쳐 위쪽 줄 번호가 밀리지 않는다, applied는 질문 순서', () => {
    const result = apply([
      { id: 'u1', kind: 'delete' },
      { id: 'c3', kind: 'keep' },
      { id: 'c1', kind: 'keep' },
      { id: 'u2', kind: 'delete' },
      { id: 'c2', kind: 'delete' },
    ]);
    expect(result.body).toBe(
      [
        '# 제목',
        '',
        '서론 첫 문장. 서론 끝 문장.',
        '',
        '둘째 문단.',
        '',
        '- 목록 하나',
        '- 뒤 문장.',
        '',
        '끝 문단 이어짐.',
        '',
      ].join('\n'),
    );
    expect(result.applied).toEqual(['c1', 'c2', 'c3', 'u1', 'u2']);
    expect(result.failed).toEqual([]);
  });

  test('채움 답은 건너뛴다(모델 몫), 같은 질문의 답이 둘이면 첫 답만', () => {
    const result = apply([
      { id: 'c1', kind: 'fill', text: '120ms에서 40ms로' },
      { id: 'u1', kind: 'keep' },
      { id: 'u1', kind: 'delete' },
    ]);
    expect(result).toEqual({
      body: BODY,
      applied: ['u1'],
      failed: [],
      changed: false,
      contentChanged: false,
    });
  });

  test('모르는 질문 id·본문에서 사라진 주석·문장은 질문 단위 실패로 남기고 나머지는 반영한다', () => {
    const questions = all();
    const drifted = BODY.replace('근거 없는 서론 주장이다. ', '').replace(
      '<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->\n\n',
      '',
    );
    const result = applyCodeAnswers(drifted, questions, [
      { id: 'zz', kind: 'keep' },
      { id: 'u1', kind: 'delete' },
      { id: 'c2', kind: 'keep' },
      { id: 'c1', kind: 'keep' },
    ]);
    expect(result.failed).toEqual([
      { id: 'zz', code: 'QUESTION_UNKNOWN' },
      { id: 'c2', code: 'COMMENT_NOT_FOUND' },
      { id: 'u1', code: 'SENTENCE_NOT_FOUND' },
    ]);
    expect(result.applied).toEqual(['c1']);
    expect(result.body).not.toContain('응답 시간이');
  });

  test('줄이 밀린 본문에서도 같은 질문의 주석·한 번만 나오는 문장은 찾는다, 두 번 나오는 문장은 앵커 줄이 아니면 빼지 않는다', () => {
    const questions = all();
    const shifted = `머리말 한 줄.\n\n${BODY}`;
    const result = applyCodeAnswers(shifted, questions, [
      { id: 'c1', kind: 'keep' },
      { id: 'u1', kind: 'delete' },
    ]);
    expect(result.applied).toEqual(['c1', 'u1']);
    expect(result.body).toContain('서론 첫 문장. 서론 끝 문장.');
    expect(result.body).not.toContain('응답 시간이');

    const twice = `${shifted}\n근거 없는 서론 주장이다.\n`;
    expect(applyCodeAnswers(twice, questions, [{ id: 'u1', kind: 'delete' }]).failed).toEqual([
      { id: 'u1', code: 'SENTENCE_NOT_FOUND' },
    ]);
  });

  test('CRLF 본문은 LF로 고쳐 돌려준다, 답이 없으면 그대로', () => {
    expect(applyCodeAnswers('가\r\n나', [], []).body).toBe('가\n나');
    expect(apply([])).toMatchObject({ body: BODY, applied: [], changed: false });
  });
});
