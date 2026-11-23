// 본문의 코드 분량 검사 — 승인 대기 화면에 "코드가 많다"를 **표시만** 한다(승인을 막지 않는다. 모델 호출 없음).
// 어투 프롬프트의 "클린룸 코드 2~4개"는 모델이 어길 수 있어(리허설 6차: 7개·코드 55%) 코드로 재서 사람에게 알린다.
// 순수 함수만. 줄이는 것은 사람이 수정 지시로 한다.

/** 펜스 여는 줄 — 들여쓰기 3칸까지, 백틱·물결 3개 이상(문단 나누기와 같은 기준). */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export interface BodyCodeMeasure {
  /** 코드 블록(펜스)마다 안쪽 줄 수 — 본문 순서. */
  blockLines: number[];
  /** 공백을 뺀 글자 수 — 코드 블록 안. */
  codeChars: number;
  /** 공백을 뺀 글자 수 — 코드 블록 밖(HTML 주석 제외). */
  proseChars: number;
}

/** 본문에서 코드 블록과 글의 분량을 잰다. 닫히지 않은 펜스는 끝까지 코드로 본다. */
export function measureBodyCode(body: string): BodyCodeMeasure {
  const blockLines: number[] = [];
  let codeChars = 0;
  const prose: string[] = [];
  let fence: string | undefined;
  let current = 0;
  for (const line of body.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')) {
    const mark = FENCE.exec(line)?.[1];
    if (fence === undefined) {
      if (mark === undefined) prose.push(line);
      else {
        fence = mark;
        current = 0;
      }
      continue;
    }
    if (
      mark !== undefined &&
      mark[0] === fence[0] &&
      mark.length >= fence.length &&
      line.trim() === mark
    ) {
      blockLines.push(current);
      fence = undefined;
      continue;
    }
    current += 1;
    codeChars += Array.from(line.replace(/\s+/g, '')).length;
  }
  if (fence !== undefined) blockLines.push(current);
  const proseChars = Array.from(
    prose
      .join('\n')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ''),
  ).length;
  return { blockLines, codeChars, proseChars };
}

export interface BodyCodeLimits {
  /** 코드 블록 수 상한. */
  maxBlocks: number;
  /** 블록 하나의 줄 수 상한. */
  maxBlockLines: number;
  /** 코드 글자 비율 상한(%) — 코드 ÷ (코드 + 글), 공백 제외. */
  maxCodePercent: number;
}

/** 기본 상한 — 블록 수는 어투 프롬프트의 "2~4개", 줄 수·비율은 리허설 6차에서 정한 값(2026-11-23). */
export const BODY_CODE_LIMITS: BodyCodeLimits = {
  maxBlocks: 4,
  maxBlockLines: 15,
  maxCodePercent: 40,
};

/** 넘은 항목 하나(값은 영어 코드 — 문구는 대시보드가 붙인다). */
export type BodyCodeFinding =
  /** 코드 블록이 상한보다 많다 */
  | { code: 'CODE_BLOCKS_OVER'; value: number; limit: number }
  /** 상한보다 긴 블록이 있다 — `count`개, 가장 긴 것이 `value`줄 */
  | { code: 'CODE_BLOCK_TOO_LONG'; value: number; limit: number; count: number }
  /** 코드 글자 비율(%)이 상한을 넘는다 */
  | { code: 'CODE_RATIO_OVER'; value: number; limit: number };

/** 본문의 코드 분량이 상한을 넘은 항목들. 넘은 것이 없으면 빈 배열. */
export function checkBodyCode(
  body: string,
  limits: BodyCodeLimits = BODY_CODE_LIMITS,
): BodyCodeFinding[] {
  const { blockLines, codeChars, proseChars } = measureBodyCode(body);
  const findings: BodyCodeFinding[] = [];
  if (blockLines.length > limits.maxBlocks)
    findings.push({ code: 'CODE_BLOCKS_OVER', value: blockLines.length, limit: limits.maxBlocks });
  const long = blockLines.filter((lines) => lines > limits.maxBlockLines);
  if (long.length > 0)
    findings.push({
      code: 'CODE_BLOCK_TOO_LONG',
      value: Math.max(...long),
      limit: limits.maxBlockLines,
      count: long.length,
    });
  const total = codeChars + proseChars;
  const percent = total === 0 ? 0 : Math.round((codeChars / total) * 100);
  if (percent > limits.maxCodePercent)
    findings.push({ code: 'CODE_RATIO_OVER', value: percent, limit: limits.maxCodePercent });
  return findings;
}
