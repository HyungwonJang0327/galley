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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 결과 파일 읽기 — 형식이 아니면 undefined(없는 것으로 다룬다). 사유 코드는 문자열이기만 하면 받는다(표시가 모르는 코드를 견딘다). */
export function parseReviewResult(text: string): ReviewResult | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.baseRunId !== 'string') return undefined;
  const { applied, unapplied } = raw;
  if (!Array.isArray(applied) || !applied.every((id): id is string => typeof id === 'string'))
    return undefined;
  if (!Array.isArray(unapplied)) return undefined;
  const failed: ReviewResult['unapplied'] = [];
  for (const entry of unapplied) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.code !== 'string')
      return undefined;
    failed.push({ id: entry.id, code: entry.code as ReviewUnappliedCode });
  }
  return { version: 1, baseRunId: raw.baseRunId, applied, unapplied: failed };
}

/**
 * 뒤 단계(링크드인·Zenn) 고침 결과 — 단계마다 한 파일(`<단계>-patch.json`, DATA_DIR만).
 *  - `patched`: 본문에서 바뀐 곳을 반영해 고쳤다  - `unchanged`: 본문 내용이 안 바뀌어 이전 결과 그대로(모델 호출 없음)
 *  - `kept`: 모델이 두 번 다 범위 밖을 바꾸거나 출력이 불량해 **이전 결과를 그대로 뒀다** — 본문의 수정이 이 글에 반영되지 않았다.
 */
export type DerivedPatchStatus = 'patched' | 'unchanged' | 'kept';
export type DerivedPatchStep = 'linkedin' | 'zenn';

export interface DerivedPatchResult {
  version: 1;
  /** 고친 대상(이전 결과)을 만든 Run. */
  baseRunId: string;
  status: DerivedPatchStatus;
  /** `kept`일 때만 — 마지막 시도가 반려된 이유. */
  code?: 'PATCH_OUT_OF_SCOPE' | 'PATCH_OUTPUT_INVALID';
}

export const derivedPatchArtifact = (step: DerivedPatchStep): string => `${step}-patch.json`;

export function renderDerivedPatchResult(result: DerivedPatchResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

const DERIVED_STATUSES: readonly string[] = ['patched', 'unchanged', 'kept'];
const DERIVED_CODES: readonly string[] = ['PATCH_OUT_OF_SCOPE', 'PATCH_OUTPUT_INVALID'];

export function parseDerivedPatchResult(text: string): DerivedPatchResult | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.baseRunId !== 'string') return undefined;
  const { status, code } = raw;
  if (typeof status !== 'string' || !DERIVED_STATUSES.includes(status)) return undefined;
  return {
    version: 1,
    baseRunId: raw.baseRunId,
    status: status as DerivedPatchStatus,
    ...(typeof code === 'string' && DERIVED_CODES.includes(code)
      ? { code: code as NonNullable<DerivedPatchResult['code']> }
      : {}),
  };
}
