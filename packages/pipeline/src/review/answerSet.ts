// 답 반영 실행이 들고 가는 질문·답 묶음 — `Run.reviewAnswers`(JSON 문자열)의 형식을 이 파일이 소유한다(decisions/review-questions.md).
// 질문(앵커 포함)을 답과 같이 담는다: 고치는 단계가 질문 파일을 다시 찾지 않아도 되고, 반영하지 못한 답을 다음 시도가
// **그 질문·답 그대로** 다시 쓸 수 있다. 순수 함수만.
import type { ReviewAnswer } from './answers.ts';
import type { ReviewQuestion } from './questions.ts';

/** 채움 답의 길이 상한(글자 수) — 프롬프트에 그대로 들어가는 사람 글이라 수정 지시와 같은 크기로 막는다. */
export const REVIEW_ANSWER_MAX_LENGTH = 2000;
/** 한 번에 답할 수 있는 질문 수 상한 — 본문 하나의 주석·근거 없음 수를 넉넉히 덮는다. */
export const REVIEW_ANSWERS_MAX = 50;

export interface ReviewAnswerItem {
  question: ReviewQuestion;
  answer: ReviewAnswer;
}

export interface ReviewAnswerSet {
  version: 1;
  items: ReviewAnswerItem[];
}

export type ReviewAnswerSetFailure =
  /** 답이 하나도 없음 */
  | 'ANSWERS_EMPTY'
  /** 답이 상한(`REVIEW_ANSWERS_MAX`)보다 많음 */
  | 'ANSWERS_TOO_MANY'
  /** 답의 id가 질문과 다르거나 같은 질문에 답이 둘, 채움인데 글이 비었음 */
  | 'ANSWER_INVALID'
  /** 채움 글이 상한(`REVIEW_ANSWER_MAX_LENGTH`)을 넘음 */
  | 'ANSWER_TOO_LONG';

export type ReviewAnswerSetResult =
  { ok: true; set: ReviewAnswerSet } | { ok: false; code: ReviewAnswerSetFailure };

/** 질문·답 묶음을 검증해 만든다. 채움 글은 앞뒤 공백을 걷는다(그 밖은 원문 그대로). */
export function buildReviewAnswerSet(items: readonly ReviewAnswerItem[]): ReviewAnswerSetResult {
  if (items.length === 0) return { ok: false, code: 'ANSWERS_EMPTY' };
  if (items.length > REVIEW_ANSWERS_MAX) return { ok: false, code: 'ANSWERS_TOO_MANY' };

  const seen = new Set<string>();
  const out: ReviewAnswerItem[] = [];
  for (const { question, answer } of items) {
    if (answer.id !== question.id || seen.has(question.id))
      return { ok: false, code: 'ANSWER_INVALID' };
    seen.add(question.id);
    if (answer.kind !== 'fill') {
      out.push({ question, answer });
      continue;
    }
    const text = answer.text.trim();
    if (text === '') return { ok: false, code: 'ANSWER_INVALID' };
    if (text.length > REVIEW_ANSWER_MAX_LENGTH) return { ok: false, code: 'ANSWER_TOO_LONG' };
    out.push({ question, answer: { id: answer.id, kind: 'fill', text } });
  }
  return { ok: true, set: { version: 1, items: out } };
}

/**
 * 답이 **글 내용**을 바꾸는가 — 채움이 하나라도 있거나, 근거 없음 질문의 삭제(그 문장을 뺀다)가 있을 때.
 * 모름과 주석 질문의 삭제는 주석만 지워 내용이 그대로다(`applyCodeAnswers`와 같은 규칙) — 뒤 단계를 돌릴지의 기준.
 */
export function answersChangeContent(items: readonly ReviewAnswerItem[]): boolean {
  return items.some(
    ({ question, answer }) =>
      answer.kind === 'fill' || (answer.kind === 'delete' && question.source === 'unsupported'),
  );
}

export function renderReviewAnswerSet(set: ReviewAnswerSet): string {
  return JSON.stringify(set);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseQuestion(value: unknown): ReviewQuestion | undefined {
  if (!isRecord(value) || !isRecord(value.anchor)) return undefined;
  const { id, source, question, reason, anchor } = value;
  if (typeof id !== 'string' || typeof question !== 'string') return undefined;
  if (source !== 'comment' && source !== 'unsupported') return undefined;
  const { paragraph, line } = anchor;
  if (!Number.isInteger(paragraph) || !Number.isInteger(line)) return undefined;
  return {
    id,
    source,
    question,
    ...(typeof reason === 'string' ? { reason } : {}),
    anchor: { paragraph: paragraph as number, line: line as number },
  };
}

function parseAnswer(value: unknown): ReviewAnswer | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined;
  if (value.kind === 'keep' || value.kind === 'delete') return { id: value.id, kind: value.kind };
  if (value.kind === 'fill' && typeof value.text === 'string')
    return { id: value.id, kind: 'fill', text: value.text };
  return undefined;
}

/** 저장된 JSON을 읽는다. 형태가 어긋나거나 검증에 걸리면 undefined — 고치는 단계가 실패로 알린다(지어내지 않는다). */
export function parseReviewAnswerSet(text: string): ReviewAnswerSet | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || !Array.isArray(raw.items)) return undefined;
  const items: ReviewAnswerItem[] = [];
  for (const entry of raw.items) {
    if (!isRecord(entry)) return undefined;
    const question = parseQuestion(entry.question);
    const answer = parseAnswer(entry.answer);
    if (question === undefined || answer === undefined) return undefined;
    items.push({ question, answer });
  }
  const built = buildReviewAnswerSet(items);
  return built.ok ? built.set : undefined;
}
