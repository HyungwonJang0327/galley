// 본문의 코드 분량 재기 — 코드 블록마다 줄 수, 코드·글 글자 수. 기준과 견주는 것은 postShape.ts(기존 글 대비 형식 검사)가 한다.
// 순수 함수만.

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
