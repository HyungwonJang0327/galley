// 확인 질문 패널의 순수 판단(클라이언트에서도 쓴다 — server-only 아님, 타입만 import). 입력 상태 → 보낼 답, 확인 Dialog 문구.
// 형식 검증은 서버(pipeline)가 같은 규칙으로 한 번 더 하지만 왕복 전에 막는다.
import type { ReviewAnswerInput, ReviewQuestionView } from './run-review';

/** 질문 하나의 선택 — `none`은 "답 안 함"(보내지 않는다). */
export type ReviewChoice = 'none' | ReviewAnswerInput['kind'];

export interface ReviewFormState {
  choices: Record<string, ReviewChoice>;
  texts: Record<string, string>;
}

/** 초기값 — 직전에 반영되지 못한 답이 있으면 그대로 채운다, 없으면 "답 안 함". */
export function initialReviewForm(questions: readonly ReviewQuestionView[]): ReviewFormState {
  const state: ReviewFormState = { choices: {}, texts: {} };
  for (const question of questions) {
    state.choices[question.id] = question.previousAnswer?.kind ?? 'none';
    state.texts[question.id] = question.previousAnswer?.text ?? '';
  }
  return state;
}

/** 고른 답이 무엇을 하는지 한 줄 — 종류가 같아도 질문 종류에 따라 결과가 다르다(주석 질문의 삭제는 주석만 지운다). */
export function describeChoice(
  source: ReviewQuestionView['source'],
  choice: ReviewChoice,
): string | null {
  if (choice === 'none') return null;
  if (choice === 'fill') return '모델이 이 답으로 그 문단만 고칩니다.';
  if (source === 'comment') {
    return choice === 'keep'
      ? '주석만 지우고 문장은 그대로 둡니다.'
      : '주석만 지웁니다 — 주석 질문은 뺄 문장이 정해져 있지 않아 문장은 그대로 남습니다.';
  }
  return choice === 'keep'
    ? '문장을 그대로 두고, 다음에 다시 묻지 않습니다.'
    : '이 문장을 본문에서 뺍니다.';
}

export type CollectAnswersResult =
  { ok: true; answers: ReviewAnswerInput[] } | { ok: false; message: string };

/** 답한 질문만 모은다. 하나도 없거나 채움 글이 비었거나 길면 보내지 않는다. */
export function collectReviewAnswers(
  questions: readonly ReviewQuestionView[],
  state: ReviewFormState,
  maxLength: number,
): CollectAnswersResult {
  const answers: ReviewAnswerInput[] = [];
  for (const question of questions) {
    const choice = state.choices[question.id] ?? 'none';
    if (choice === 'none') continue;
    if (choice !== 'fill') {
      answers.push({ id: question.id, kind: choice });
      continue;
    }
    const text = (state.texts[question.id] ?? '').trim();
    if (text === '') return { ok: false, message: '채움을 고른 질문에 내용을 입력해 주세요.' };
    if (text.length > maxLength) {
      return { ok: false, message: `채움 내용은 ${maxLength}자 이하로 써 주세요.` };
    }
    answers.push({ id: question.id, kind: 'fill', text });
  }
  if (answers.length === 0) return { ok: false, message: '답할 질문을 하나 이상 골라 주세요.' };
  return { ok: true, answers };
}

export interface AnswerPlanText {
  /** "채움 1 · 모름 2 · 삭제 1" */
  counts: string;
  /** 이 답으로 무엇이 다시 도는지. */
  effect: string;
  /** 모델을 부르는가(비용). */
  costs: boolean;
}

/**
 * 확인 Dialog 문구. 글 내용이 바뀌는 답(채움, 근거 없음 문장의 삭제)이 있으면 근거 검증이 다시 돌고 링크드인·Zenn이
 * 그 대목만 고쳐진다 — pipeline `answersChangeContent`와 같은 규칙(값은 서버가 정하고 여기는 안내만).
 */
export function describeAnswerPlan(
  questions: readonly ReviewQuestionView[],
  answers: readonly ReviewAnswerInput[],
): AnswerPlanText {
  const count = (kind: ReviewAnswerInput['kind']) => answers.filter((a) => a.kind === kind).length;
  const counts = (
    [
      ['채움', count('fill')],
      ['모름', count('keep')],
      ['삭제', count('delete')],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
    .join(' · ');
  const sourceOf = (id: string) => questions.find((q) => q.id === id)?.source;
  const fills = count('fill') > 0;
  const changes =
    fills || answers.some((a) => a.kind === 'delete' && sourceOf(a.id) === 'unsupported');
  return {
    counts,
    costs: changes,
    effect: changes
      ? `${fills ? '본문은 답한 문단만 고치고, ' : ''}근거 검증을 다시 돌린 뒤 링크드인·Zenn도 바뀐 대목만 고칩니다. 삽화·발행정보는 그대로 둡니다.`
      : '모델을 부르지 않고 본문의 주석만 정리합니다. 뒤 단계는 그대로 둡니다.',
  };
}
