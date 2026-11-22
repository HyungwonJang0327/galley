// 확인 질문 고르기 — 승인 대기가 된 실행에서 사람에게 물을 곳을 **규칙으로** 추린다(모델 호출 없음, decisions/review-questions.md).
// 우선순위: 본문의 `[확인 필요]` 주석 → 근거 검증의 "근거 없음" 주장. 같은 종류 안에서는 본문 순서. 상위 3개만 질문으로
// 올리고 넘치는 것은 버리지 않고 `more`에 둔다(화면이 "그 외 N건"으로 접어 보인다). 질문마다 앵커(문단·줄)를 같이 둔다 —
// 답 반영이 그 문단만 고쳤는지 검사할 때 쓴다. 순수 함수만.
import { paragraphIndexAtLine, splitParagraphs } from './paragraphs.ts';

/** 한 번에 올리는 질문 수 상한. */
export const REVIEW_QUESTIONS_MAX = 3;

/** DATA_DIR 산출물 이름 — posts로 복사하지 않는다(검수 과정의 기록이지 발행물이 아니다). */
export const REVIEW_QUESTIONS_ARTIFACT = 'questions.json';

/** `comment` = 본문 단계가 남긴 `[확인 필요]` 주석, `unsupported` = 근거 검증이 근거를 찾지 못한 주장. DB·파일 값(영어). */
export type ReviewQuestionSource = 'comment' | 'unsupported';

export interface ReviewAnchor {
  /** 그 항목이 든 문단 번호(splitParagraphs 기준, 0부터). */
  paragraph: number;
  /** 본문 줄 번호(1부터) — 주석이 시작하는 줄, 주장은 근거 검증의 `line`. */
  line: number;
}

export interface ReviewQuestion {
  /** 실행 안에서 유일한 id — `c1`·`c2`…(주석), `u1`…(근거 없음). 본문 순서로 매긴다. */
  id: string;
  source: ReviewQuestionSource;
  /** 주석: 사용자에게 물을 질문 한 문장(주석의 앞부분). 근거 없음: 그 주장 원문 — 화면이 문구를 입힌다. */
  question: string;
  /** 주석: 왜 확인하지 못했는지(뒷부분). 근거 없음: 모델 판정의 한 줄 사유. 없으면 생략. */
  reason?: string;
  anchor: ReviewAnchor;
}

export interface ReviewQuestions {
  version: 1;
  /** 사람에게 올리는 질문(최대 REVIEW_QUESTIONS_MAX). */
  questions: ReviewQuestion[];
  /** 넘친 것 — 같은 형태로 보관한다("그 외 N건"). */
  more: ReviewQuestion[];
}

/** 질문 추출에 필요한 주장 필드만 — 근거 검증의 VerificationClaim이 이 형태를 만족한다. */
export interface ReviewClaim {
  text: string;
  status: string;
  line: number;
  note?: string;
}

/**
 * 본문 프롬프트가 고정한 주석 형식: `<!-- [확인 필요] <질문 한 문장> — <왜 확인 못 했는지 한 줄> -->`.
 * 구분은 **공백으로 둘러싼 줄표(—)** 의 첫 자리다. 줄표가 없으면(옛 형식) 내용 전체가 질문이다.
 */
const COMMENT = /<!--\s*\[확인 필요\]([\s\S]*?)-->/g;
const SEPARATOR = /\s+—\s+/;

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

export interface ReviewComment {
  question: string;
  reason?: string;
  /** 주석이 시작하는 줄(1부터). */
  line: number;
}

/** 본문의 `[확인 필요]` 주석을 본문 순서로. 내용이 빈 주석은 버린다(물을 것이 없다). 코드 펜스 안의 것도 읽는다. */
export function parseReviewComments(body: string): ReviewComment[] {
  const text = body.replace(/\r\n/g, '\n');
  const comments: ReviewComment[] = [];
  for (const match of text.matchAll(COMMENT)) {
    const content = match[1] ?? '';
    const cut = SEPARATOR.exec(content);
    const question = oneLine(cut === null ? content : content.slice(0, cut.index));
    const reason = cut === null ? '' : oneLine(content.slice(cut.index + cut[0].length));
    if (question === '') continue;
    const line = text.slice(0, match.index).split('\n').length;
    comments.push({ question, ...(reason === '' ? {} : { reason }), line });
  }
  return comments;
}

/**
 * 질문 고르기. `claims`는 근거 검증 리포트의 주장 목록(없으면 빈 배열 — 주석만으로 고른다).
 * 주석 → 근거 없음 순, 각각 본문 순서. 앞에서 `max`개가 질문, 나머지는 `more`.
 */
export function selectReviewQuestions(
  body: string,
  claims: readonly ReviewClaim[],
  max: number = REVIEW_QUESTIONS_MAX,
): ReviewQuestions {
  const paragraphs = splitParagraphs(body);
  const anchorAt = (line: number): ReviewAnchor => ({
    paragraph: paragraphIndexAtLine(paragraphs, line) ?? 0,
    line,
  });

  const fromComments = parseReviewComments(body).map((comment, i): ReviewQuestion => ({
    id: `c${i + 1}`,
    source: 'comment',
    question: comment.question,
    ...(comment.reason === undefined ? {} : { reason: comment.reason }),
    anchor: anchorAt(comment.line),
  }));
  const fromClaims = claims
    .filter((claim) => claim.status === 'unsupported' && claim.text.trim() !== '')
    .map((claim, order) => ({ claim, order }))
    // 본문 순서 — 같은 줄이면 리포트 순서를 지킨다.
    .sort((a, b) => a.claim.line - b.claim.line || a.order - b.order)
    .map(({ claim }, i): ReviewQuestion => {
      const note = claim.note === undefined ? '' : oneLine(claim.note);
      return {
        id: `u${i + 1}`,
        source: 'unsupported',
        question: oneLine(claim.text),
        ...(note === '' ? {} : { reason: note }),
        anchor: anchorAt(claim.line),
      };
    });

  const all = [...fromComments, ...fromClaims];
  const limit = Math.max(0, Math.floor(max));
  return { version: 1, questions: all.slice(0, limit), more: all.slice(limit) };
}
