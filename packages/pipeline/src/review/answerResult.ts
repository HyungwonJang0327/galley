// 답 반영 결과 — 본문을 고치는 단계가 질문 단위로 남기는 기록(decisions/review-questions.md "미반영 표시는 질문 단위").
// DATA_DIR 산출물 파일이다(posts에 복사하지 않는다). 화면이 "미반영"을 보이고, 미반영된 질문·답을 다음 시도가 다시 쓴다.
import type { CodeAnswerFailure } from './answers.ts';

export const REVIEW_RESULT_ARTIFACT = 'review-result.json';

/** 반영하지 못한 이유(파일 값, 영어). 표시는 대시보드가 붙인다. */
export type ReviewUnappliedCode =
  | CodeAnswerFailure
  /** 채움: 고칠 자리(주석·문장)를 본문에서 다시 찾지 못함 */
  | 'ANCHOR_NOT_FOUND'
  /** 채움: 모델이 두 번 다 답한 곳 밖의 문단을 바꿈 — 이전 본문을 유지했다 */
  | 'PATCH_OUT_OF_SCOPE'
  /** 채움: 모델 출력이 두 번 다 비었거나 상한에서 잘림 — 이전 본문을 유지했다 */
  | 'PATCH_OUTPUT_INVALID';

export interface ReviewResult {
  version: 1;
  /** 고친 대상(이전 본문)을 만든 Run. */
  baseRunId: string;
  /** 반영한 질문 id. */
  applied: string[];
  /** 반영하지 못한 질문 — 그 질문·답은 이 Run의 `reviewAnswers`에 그대로 있다. */
  unapplied: { id: string; code: ReviewUnappliedCode }[];
}

export function renderReviewResult(result: ReviewResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
