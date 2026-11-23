// 질문 파일(`questions.json`) — 승인 대기가 된 실행에서 사람에게 물을 곳(decisions/review-questions.md). 워커가 7단계를 마치고
// 승인 대기로 넘기기 직전에 쓴다(단계가 아니다 — 본문·근거 검증이 어느 Run의 것이든 **그 실행의 최종 본문** 기준으로 한 번).
// 모델 호출 없음: 본문(velog.md)과 근거 검증 리포트(verification.json)를 읽어 규칙으로 고른다(`selectReviewQuestions`).
// 파일이 없는 실행(이 기능 전의 실행)은 읽는 쪽이 같은 함수(`collectReviewQuestions`)로 그 자리에서 만든다.
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import { PUBLISH_PATCH_ARTIFACT, parsePublishPatchResult } from './answerResult.ts';
import { locateQuestion } from './answers.ts';
import { parseReviewAnswerSet, parseReviewQuestion } from './answerSet.ts';
import {
  REVIEW_QUESTIONS_ARTIFACT,
  selectReviewQuestions,
  type ReviewClaim,
  type ReviewQuestion,
  type ReviewQuestions,
} from './questions.ts';

const VELOG_ARTIFACT = 'velog.md';
const VERIFICATION_ARTIFACT = 'verification.json';

export function renderReviewQuestions(questions: ReviewQuestions): string {
  return `${JSON.stringify(questions, null, 2)}\n`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 질문 파일 읽기 — 형식이 아니면 undefined(없는 것으로 다룬다). */
export function parseReviewQuestions(text: string): ReviewQuestions | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || raw.version !== 1) return undefined;
  if (!Array.isArray(raw.questions) || !Array.isArray(raw.more)) return undefined;
  const read = (values: unknown[]): ReviewQuestion[] | undefined => {
    const out: ReviewQuestion[] = [];
    for (const value of values) {
      const question = parseReviewQuestion(value);
      if (question === undefined) return undefined;
      out.push(question);
    }
    return out;
  };
  const questions = read(raw.questions);
  const more = read(raw.more);
  return questions === undefined || more === undefined
    ? undefined
    : { version: 1, questions, more };
}

/** 근거 검증 리포트에서 질문 고르기에 필요한 주장 필드만 — 리포트가 없거나 깨졌으면 빈 배열(주석만으로 고른다). */
function readClaims(text: string): ReviewClaim[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isRecord(raw) || !Array.isArray(raw.claims)) return [];
  return raw.claims.flatMap((claim): ReviewClaim[] =>
    isRecord(claim) &&
    typeof claim.text === 'string' &&
    typeof claim.status === 'string' &&
    typeof claim.line === 'number'
      ? [
          {
            text: claim.text,
            status: claim.status,
            line: claim.line,
            ...(typeof claim.note === 'string' ? { note: claim.note } : {}),
          },
        ]
      : [],
  );
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export interface CollectReviewQuestionsInput {
  slug: string;
  /** 이 실행의 본문·근거 검증 리포트를 만든 Run(이전 결과 유지면 출처 Run, 아니면 이 Run). */
  bodyRunId: string;
  verifyRunId: string;
  /**
   * 이미 "모름(그대로 둔다)"으로 확정한 근거 없음 문장 — 다시 묻지 않는다. 근거 검증을 다시 돌리지 않았거나 다시 돌려도
   * 같은 문장은 또 근거 없음으로 나오기 때문이다.
   */
  confirmed?: readonly string[];
  /**
   * 이 실행의 발행정보를 만든 Run — 그 단계가 남긴 고침 결과(`publishInfo-patch.json`)에 "다시 만들지 물을 삽화"가 있으면
   * 삽화 질문을 하나 더한다. 없으면(답 반영 실행이 아니거나 삽화 자리 앞뒤가 안 바뀜) 묻지 않는다.
   */
  publishRunId?: string;
}

export type CollectReviewQuestionsResult =
  { ok: true; value: ReviewQuestions } | { ok: false; code: 'REVIEW_BODY_MISSING' };

/**
 * 질문 고르기(파일 I/O 포함). 근거 없음 질문의 앵커는 **본문에서 그 문장을 다시 찾아** 잡는다 — 근거 검증이 이전 결과
 * 유지인데 본문이 고쳐졌으면(주석 제거로 줄이 당겨짐) 리포트의 줄 번호가 어긋난다.
 */
export async function collectReviewQuestions(
  artifacts: ArtifactStore,
  input: CollectReviewQuestionsInput,
): Promise<CollectReviewQuestionsResult> {
  const body = await artifacts.read(input.slug, input.bodyRunId, VELOG_ARTIFACT);
  if (!body.ok) return { ok: false, code: 'REVIEW_BODY_MISSING' };
  const report = await artifacts.read(input.slug, input.verifyRunId, VERIFICATION_ARTIFACT);
  const confirmed = new Set((input.confirmed ?? []).map(oneLine));
  const claims = (report.ok ? readClaims(report.text) : []).filter(
    (claim) => !confirmed.has(oneLine(claim.text)),
  );
  const selected = selectReviewQuestions(body.text, claims);
  const illustration =
    input.publishRunId === undefined
      ? undefined
      : await illustrationQuestion(artifacts, input.slug, input.publishRunId);
  const reanchor = (question: ReviewQuestion): ReviewQuestion => {
    if (question.source !== 'unsupported') return question;
    const anchor = locateQuestion(body.text, question);
    return anchor === undefined ? question : { ...question, anchor };
  };
  return {
    ok: true,
    value: {
      version: 1,
      // 삽화 질문은 상위 3건의 자리를 뺏지 않고 그 뒤에 따로 붙는다(글의 사실을 묻는 질문이 아니다).
      questions: [
        ...selected.questions.map(reanchor),
        ...(illustration === undefined ? [] : [illustration]),
      ],
      more: selected.more.map(reanchor),
    },
  };
}

/** 삽화 질문의 id — 한 실행에 하나(걸린 삽화를 한 번에 묻는다. 다시 만들기는 삽화 단계 전체를 다시 돌린다). */
export const ILLUSTRATION_QUESTION_ID = 'i1';

/** 발행정보 고침 결과에 물을 삽화가 있으면 질문 하나 — 글은 삽화 이름들, 앵커는 본문에서 가장 앞선 자리. */
async function illustrationQuestion(
  artifacts: ArtifactStore,
  slug: string,
  publishRunId: string,
): Promise<ReviewQuestion | undefined> {
  const read = await artifacts.read(slug, publishRunId, PUBLISH_PATCH_ARTIFACT);
  const items = (read.ok ? parsePublishPatchResult(read.text) : undefined)?.illustrations ?? [];
  const first = [...items].sort((a, b) => a.line - b.line)[0];
  if (first === undefined) return undefined;
  return {
    id: ILLUSTRATION_QUESTION_ID,
    source: 'illustration',
    question: items.map((item) => item.name).join(', '),
    anchor: { paragraph: first.paragraph, line: first.line },
  };
}

/** 워커가 넘기는 실행의 모양 중 여기서 쓰는 것만(ClaimedRun이 만족한다). */
export interface ReviewQuestionRun {
  id: string;
  topicSlug: string;
  /** 이 실행을 만든 확인 질문의 답(JSON). 답 반영 실행이 아니면 없다. */
  reviewAnswers?: string;
  steps: readonly { name: string; origin?: string; sourceRunId?: string }[];
}

/** 이 실행의 입력(본문·검증의 출처 Run, 이미 확정한 문장) — 워커와 화면(파일 없는 실행)이 같은 규칙을 쓴다. */
export function reviewQuestionsInputOf(run: ReviewQuestionRun): CollectReviewQuestionsInput {
  // 이전 결과 유지(carried)만 출처 Run의 산출물이다. 고침(patched)·다시 만듦(fresh)은 이 Run에 있다.
  const runOf = (name: string) => {
    const step = run.steps.find((s) => s.name === name);
    return step?.origin === 'carried' && step.sourceRunId !== undefined ? step.sourceRunId : run.id;
  };
  const answers =
    run.reviewAnswers === undefined ? undefined : parseReviewAnswerSet(run.reviewAnswers);
  const confirmed = (answers?.items ?? [])
    .filter(({ question, answer }) => question.source === 'unsupported' && answer.kind === 'keep')
    .map(({ question }) => question.question);
  return {
    slug: run.topicSlug,
    bodyRunId: runOf('velog'),
    verifyRunId: runOf('verify'),
    publishRunId: runOf('publishInfo'),
    ...(confirmed.length === 0 ? {} : { confirmed }),
  };
}

/**
 * 워커용 — 승인 대기로 넘기기 직전에 질문 파일을 쓴다. 본문이 없으면(DATA_DIR 없이 돈 Mock 등) 아무것도 쓰지 않고
 * false를 돌려준다. 쓰기 실패는 던진다(워커가 기록만 하고 승인 대기로 넘긴다 — 파일은 읽는 쪽이 다시 만들 수 있다).
 */
export function createReviewQuestionWriter(artifacts: ArtifactStore): {
  prepare(run: ReviewQuestionRun): Promise<boolean>;
} {
  return {
    async prepare(run) {
      const collected = await collectReviewQuestions(artifacts, reviewQuestionsInputOf(run));
      if (!collected.ok) return false;
      await artifacts.write(
        run.topicSlug,
        run.id,
        REVIEW_QUESTIONS_ARTIFACT,
        renderReviewQuestions(collected.value),
      );
      return true;
    },
  };
}
