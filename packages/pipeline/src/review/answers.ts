// 확인 질문의 답 — 종류는 셋(decisions/review-questions.md): 채움(fill) / 모름(keep, 현행 유지) / 삭제(delete, 그 문장 빼기).
// **모름·삭제는 모델 없이 코드로** 본문을 고친다 — 이 파일. 채움만 모델을 부른다(본문 패치 단계).
//  - 모름: 그 질문의 `[확인 필요]` 주석만 지운다. 근거 없음 질문이면 본문은 그대로다(지울 주석이 없다).
//  - 삭제: 근거 없음 질문이면 그 주장 문장을 본문에서 뺀다. 주석 질문이면 주석만 지운다 — 주석은 "넣지 않은 사실"의 자리라
//    코드가 뺄 문장을 알 수 없다(본문 프롬프트 규칙: 근거 없는 것은 쓰지 않고 주석으로 남긴다).
// 줄 번호가 밀리지 않게 **아래 줄부터** 고친다. 순수 함수만.
import { paragraphIndexAtLine, splitParagraphs } from './paragraphs.ts';
import type { ReviewAnchor, ReviewQuestion } from './questions.ts';

/** 파일·DB 값(영어). 표시는 대시보드가 붙인다(채움·모름·삭제). */
export type ReviewAnswerKind = 'fill' | 'keep' | 'delete';

export type ReviewAnswer =
  /** 채움 — 사람이 적은 사실. 모델이 그 문단에 반영한다. */
  | { id: string; kind: 'fill'; text: string }
  | { id: string; kind: 'keep' }
  | { id: string; kind: 'delete' };

/** 코드로 고치지 못한 이유 — 본문이 그새 달라져 주석·문장을 그 자리에서 찾지 못했다. */
export type CodeAnswerFailure = 'QUESTION_UNKNOWN' | 'COMMENT_NOT_FOUND' | 'SENTENCE_NOT_FOUND';

export interface CodeAnswersResult {
  body: string;
  /** 코드로 반영한 질문 id(본문 순서). 근거 없음 + 모름처럼 바꿀 것이 없는 답도 반영된 것으로 센다. */
  applied: string[];
  /** 반영하지 못한 질문 — 질문 단위로 남겨 화면이 "미반영"으로 보인다. */
  failed: { id: string; code: CodeAnswerFailure }[];
  /** 본문 글자가 실제로 바뀌었는가(주석 제거 포함). */
  changed: boolean;
  /** 주석이 아닌 **글 내용**이 바뀌었는가 — 문장을 뺀 경우만. 뒤 단계(검증·패치)를 돌릴지의 기준. */
  contentChanged: boolean;
}

const COMMENT = /<!--\s*\[확인 필요\][\s\S]*?-->/g;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `from`번째 줄(0부터)이 시작하는 글자 위치. */
function lineOffset(text: string, lineIndex: number): number {
  let offset = 0;
  for (let i = 0; i < lineIndex; i += 1) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}

/**
 * [start, end)를 지우고 자리를 다듬는다: 그 줄이 공백만 남으면 줄째 없애고, 그래서 빈 줄이 겹치면 하나로, 글 맨 앞의 빈 줄은 없앤다.
 * 줄 안에서 지웠으면 생긴 겹 공백을 하나로 줄인다. 지운 자리 **위쪽 줄은 건드리지 않는다**(줄 번호 보존).
 */
function removeRange(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const head = text.slice(lineStart, start);
  const tail = text.slice(end, lineEnd);
  const merged =
    head.trim() === '' && tail.trim() === ''
      ? ''
      : `${head.replace(/[ \t]+$/, '')}${head.trim() === '' || tail.trim() === '' ? '' : ' '}${tail.replace(/^[ \t]+/, '')}`.replace(
          /[ \t]+$/,
          '',
        );
  if (merged !== '') return `${text.slice(0, lineStart)}${merged}${text.slice(lineEnd)}`;

  // 줄이 통째로 비었다 — 줄을 없앤다(줄바꿈 하나와 함께).
  const before = text.slice(0, lineStart);
  let after = text.slice(nextBreak === -1 ? text.length : nextBreak + 1);
  const blankBefore = before === '' || /\n[ \t]*\n$/.test(before) || /^[ \t]*\n$/.test(before);
  // 앞이 빈 줄(또는 글의 맨 앞)이고 뒤도 빈 줄로 시작하면 빈 줄이 겹친다 — 뒤의 것을 하나 없앤다.
  if (blankBefore) after = after.replace(/^[ \t]*\n/, '');
  if (after === '') return before.replace(/\n+$/, '\n');
  return `${before}${after}`;
}

/** 앵커 줄부터 시작하는 `[확인 필요]` 주석 중 질문 글이 맞는 첫 번째. 없으면 그 줄 이후의 같은 질문 주석(줄이 조금 밀린 경우). */
function findComment(
  body: string,
  question: ReviewQuestion,
): { start: number; end: number } | undefined {
  const from = lineOffset(body, question.anchor.line - 1);
  let fallback: { start: number; end: number } | undefined;
  for (const match of body.matchAll(COMMENT)) {
    const content = oneLine(match[0].replace(/^<!--\s*\[확인 필요\]/, '').replace(/-->$/, ''));
    if (!content.startsWith(question.question)) continue;
    const range = { start: match.index, end: match.index + match[0].length };
    if (match.index >= from) return range;
    fallback ??= range;
  }
  return fallback;
}

/** 주장 문장의 자리 — 앵커 줄에서 먼저 찾고, 없으면 본문 전체에서 한 번만 나올 때만(엉뚱한 문장을 빼지 않게). 공백 차이는 무시한다. */
function findSentence(
  body: string,
  question: ReviewQuestion,
): { start: number; end: number } | undefined {
  const words = question.question.split(' ').filter((word) => word !== '');
  if (words.length === 0) return undefined;
  const pattern = new RegExp(words.map(escapeRegExp).join('\\s+'), 'g');
  const lineStart = lineOffset(body, question.anchor.line - 1);
  const lineBreak = body.indexOf('\n', lineStart);
  const lineEnd = lineBreak === -1 ? body.length : lineBreak;
  const matches = [...body.matchAll(pattern)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const onLine = matches.find((m) => m.start >= lineStart && m.start < lineEnd);
  if (onLine !== undefined) return onLine;
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * 질문이 **지금 이 본문**에서 가리키는 자리 — 주석 질문은 그 주석, 근거 없음 질문은 그 문장. 앞선 수정으로 줄·문단 번호가
 * 밀렸을 수 있어 저장된 앵커를 그대로 믿지 않고 다시 찾는다(찾는 규칙은 `applyCodeAnswers`와 같다). 못 찾으면 undefined.
 */
export function locateQuestion(body: string, question: ReviewQuestion): ReviewAnchor | undefined {
  const text = body.replace(/\r\n/g, '\n');
  const range =
    question.source === 'comment' ? findComment(text, question) : findSentence(text, question);
  if (range === undefined) return undefined;
  const line = text.slice(0, range.start).split('\n').length;
  const paragraph = paragraphIndexAtLine(splitParagraphs(text), line);
  return paragraph === undefined ? undefined : { paragraph, line };
}

/**
 * `[확인 필요]` 주석을 전부 걷어낸 본문 — **글 내용만** 견줄 때 쓴다(뒤 단계 고침이 "본문의 무엇이 바뀌었나"를 볼 때:
 * 주석은 사실이 아니라 주석만 지운 문단은 바뀐 것이 아니다). 지우는 방식은 모름 답과 같다(줄이 비면 줄째).
 */
export function stripReviewComments(body: string): string {
  let text = body.replace(/\r\n/g, '\n');
  const ranges = [...text.matchAll(COMMENT)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  // 아래부터 — 앞쪽 자리가 밀리지 않는다.
  for (const range of ranges.reverse()) text = removeRange(text, range.start, range.end);
  return text;
}

/**
 * 모름·삭제 답을 본문에 반영한다. 채움(fill) 답은 건너뛴다(모델 몫 — `applied`·`failed` 어디에도 넣지 않는다).
 * `questions`는 이 본문에서 뽑은 질문 목록(질문 + 그 외 전부)이다.
 */
export function applyCodeAnswers(
  body: string,
  questions: readonly ReviewQuestion[],
  answers: readonly ReviewAnswer[],
): CodeAnswersResult {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const failed: CodeAnswersResult['failed'] = [];
  const todo: { question: ReviewQuestion; kind: 'keep' | 'delete' }[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    if (answer.kind === 'fill' || seen.has(answer.id)) continue;
    seen.add(answer.id);
    const question = byId.get(answer.id);
    if (question === undefined) failed.push({ id: answer.id, code: 'QUESTION_UNKNOWN' });
    else todo.push({ question, kind: answer.kind });
  }

  let text = body.replace(/\r\n/g, '\n');
  const original = text;
  let contentChanged = false;
  const applied: string[] = [];
  // 아래 줄부터 — 위쪽 질문의 줄 번호가 밀리지 않는다.
  todo.sort((a, b) => b.question.anchor.line - a.question.anchor.line);
  for (const { question, kind } of todo) {
    if (question.source === 'comment') {
      const range = findComment(text, question);
      if (range === undefined) {
        failed.push({ id: question.id, code: 'COMMENT_NOT_FOUND' });
        continue;
      }
      text = removeRange(text, range.start, range.end);
    } else if (kind === 'delete') {
      const range = findSentence(text, question);
      if (range === undefined) {
        failed.push({ id: question.id, code: 'SENTENCE_NOT_FOUND' });
        continue;
      }
      text = removeRange(text, range.start, range.end);
      contentChanged = true;
    }
    // 근거 없음 + 모름: 본문은 그대로 — 그 문장을 그대로 두기로 확정한 것이다.
    applied.push(question.id);
  }
  const order = new Map(questions.map((question, index) => [question.id, index]));
  applied.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { body: text, applied, failed, changed: text !== original, contentChanged };
}
