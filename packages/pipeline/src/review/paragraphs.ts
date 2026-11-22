// 본문(마크다운)을 문단으로 나눈다 — 확인 질문의 앵커와 "답한 곳만 고쳤는가" 검사가 같은 문단 번호를 쓴다
// (decisions/review-questions.md). 문단 = 빈 줄로 나눈 덩어리. 코드 펜스는 안에 빈 줄이 있어도 통째로 한 문단이다.
// 줄 번호는 1부터 — 근거 검증의 `line`과 같은 기준이다. 순수 함수만.

export interface Paragraph {
  /** 문단 번호(0부터, 본문 순서). */
  index: number;
  /** 첫 줄·마지막 줄(1부터, 양끝 포함). */
  startLine: number;
  endLine: number;
  /** 문단 원문(줄바꿈 포함, 앞뒤 빈 줄 없음). */
  text: string;
}

/** 펜스 여는 줄 — 들여쓰기 3칸까지, 백틱·물결 3개 이상. 닫는 줄은 같은 문자가 같거나 더 길어야 한다(CommonMark). */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function splitParagraphs(body: string): Paragraph[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const paragraphs: Paragraph[] = [];
  let start = -1;
  let fence: string | undefined;

  const close = (endExclusive: number) => {
    if (start === -1) return;
    paragraphs.push({
      index: paragraphs.length,
      startLine: start + 1,
      endLine: endExclusive,
      text: lines.slice(start, endExclusive).join('\n'),
    });
    start = -1;
  };

  lines.forEach((line, i) => {
    if (fence !== undefined) {
      // 펜스 안 — 빈 줄도 문단을 끊지 않는다. 닫는 줄에서 펜스만 끝낸다(문단은 다음 빈 줄에서 끝난다).
      const closing = FENCE.exec(line)?.[1];
      if (
        closing !== undefined &&
        closing[0] === fence[0] &&
        closing.length >= fence.length &&
        line.trim() === closing
      )
        fence = undefined;
      return;
    }
    if (line.trim() === '') {
      close(i);
      return;
    }
    if (start === -1) start = i;
    const opening = FENCE.exec(line)?.[1];
    if (opening !== undefined) fence = opening;
  });
  // 닫히지 않은 펜스·마지막 문단 — 끝까지가 한 문단. 끝의 빈 줄은 뺀다.
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === '') end -= 1;
  if (start !== -1 && end > start) close(end);
  return paragraphs;
}

/** 그 줄(1부터)이 든 문단 번호. 문단 사이 빈 줄이면 바로 앞 문단(없으면 첫 문단), 문단이 없으면 undefined. */
export function paragraphIndexAtLine(
  paragraphs: readonly Paragraph[],
  line: number,
): number | undefined {
  if (paragraphs.length === 0) return undefined;
  let previous = paragraphs[0]!.index;
  for (const paragraph of paragraphs) {
    if (line < paragraph.startLine) return previous;
    if (line <= paragraph.endLine) return paragraph.index;
    previous = paragraph.index;
  }
  return previous;
}
