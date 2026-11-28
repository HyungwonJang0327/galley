// 기존 글 대비 형식 검사 — 승인 대기 화면에 본문의 분량·형식을 **표시만** 한다(승인을 막지 않는다. 모델 호출 없음).
// 기준은 어투 프롬프트의 "본문 2,000~3,000자(코드 제외) · 코드 2~4개" 하나다. 블록 길이·코드 비율은 경고, 그 밖의 수치(인라인 코드·
// 문단·삽화 자리·결과 절 날짜)는 기존 글 23편의 범위와 나란히 보여 주기만 한다(decisions/evidence-collection.md 2026-11-28 단위 4).
// 이 수치에 맞추려고 본문 프롬프트를 고치지 않는다 — 고치는 것은 사람이 수정 지시로 한다. 순수 함수만.
import { measureBodyCode } from './bodyCode.ts';

/** 펜스 여는 줄 — bodyCode.ts와 같은 기준. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** 결과 절 날짜 — `2025.12.06` · `2023.03` · `2026-06-20` · `2024/3`. */
const DATE = /(?<!\d)\d{4}[.\-/]\d{1,2}(?:[.\-/]\d{1,2})?(?!\d)/;

export interface PostShape {
  /** 공백을 뺀 글자 수 — 코드 블록 밖(HTML 주석 제외). */
  proseChars: number;
  /** 코드 블록(펜스) 수. */
  codeBlocks: number;
  /** 가장 긴 코드 블록의 줄 수(블록이 없으면 0). */
  longestBlockLines: number;
  /** 코드 글자 비율(%) — 코드 ÷ (코드 + 글), 공백 제외. */
  codePercent: number;
  /** 글 안의 인라인 코드(백틱 한 쌍) 수. */
  inlineCodes: number;
  /** 문단 수 — 빈 줄로 나뉜 덩어리 중 제목·목록·표·인용·그림이 아닌 것. */
  paragraphs: number;
  /** 삽화 자리 수 — `<!-- [삽화] … -->` 주석과 그림(`![`). */
  illustrationSlots: number;
  /** `## 결과` 절의 목록 줄 가운데 날짜가 든 줄 수(타임라인). 절이 없으면 0. */
  resultDates: number;
}

/** 코드 블록을 뺀 줄들(닫히지 않은 펜스는 끝까지 코드). */
function proseLines(body: string): string[] {
  const out: string[] = [];
  let fence: string | undefined;
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const mark = FENCE.exec(line)?.[1];
    if (fence === undefined) {
      if (mark === undefined) out.push(line);
      else {
        fence = mark;
        out.push(''); // 블록 자리는 문단 경계다
      }
      continue;
    }
    if (
      mark !== undefined &&
      mark[0] === fence[0] &&
      mark.length >= fence.length &&
      line.trim() === mark
    )
      fence = undefined;
  }
  return out;
}

/** 본문의 분량·형식을 잰다. */
export function measurePostShape(body: string): PostShape {
  const { blockLines, codeChars, proseChars } = measureBodyCode(body);
  const total = codeChars + proseChars;
  const raw = proseLines(body).join('\n');
  const illustrationSlots =
    (raw.match(/<!--\s*\[삽화\]/g) ?? []).length + (raw.match(/!\[/g) ?? []).length;
  const prose = raw.replace(/<!--[\s\S]*?-->/g, '');
  const paragraphs = prose
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '' && !/^(#{1,6} |[-*+] |\d+\. |\||>|!\[)/.test(p)).length;

  let resultDates = 0;
  let inResult = false;
  for (const line of prose.split('\n')) {
    if (/^## /.test(line)) inResult = /^## +결과/.test(line);
    else if (inResult && /^\s*[-*+] /.test(line) && DATE.test(line)) resultDates += 1;
  }

  return {
    proseChars,
    codeBlocks: blockLines.length,
    longestBlockLines: blockLines.length === 0 ? 0 : Math.max(...blockLines),
    codePercent: total === 0 ? 0 : Math.round((codeChars / total) * 100),
    inlineCodes: (prose.match(/`[^`\n]+`/g) ?? []).length,
    paragraphs,
    illustrationSlots,
    resultDates,
  };
}

export interface PostShapeLimits {
  /** 본문 글자 수(코드 제외, 공백 제외)의 기준 범위. */
  proseChars: { min: number; max: number };
  /** 코드 블록 수의 기준 범위. */
  codeBlocks: { min: number; max: number };
  /** 경고: 블록 하나의 줄 수가 이보다 길다. */
  warnBlockLines: number;
  /** 경고: 코드 글자 비율(%)이 이보다 높다. */
  warnCodePercent: number;
}

/**
 * 기준(범위) = 어투 프롬프트의 "본문 2,000~3,000자(코드 제외) · 코드 2~4개". 경고 선 = 기존 글 23편에서 가장 큰 값(가장 긴 블록 49줄 ·
 * 코드 47%, 2026-11-24 실측) — 기존 글 어느 것도 걸리지 않는 선이다(RH15의 15줄·40%는 23편 중 21편·2편이 걸렸다).
 */
export const POST_SHAPE_LIMITS: PostShapeLimits = {
  proseChars: { min: 2000, max: 3000 },
  codeBlocks: { min: 2, max: 4 },
  warnBlockLines: 49,
  warnCodePercent: 47,
};

/**
 * 기존 글 23편의 범위(2026-11-28 이 파일의 함수로 실측) — 표시만 하는 수치 옆에 견줄 값. 결과 절 날짜는 날짜 목록이 있는 6편의 범위다
 * (나머지 17편은 결과 절에 날짜 목록이 없다 = 0).
 */
export const POST_SHAPE_REFERENCE = {
  proseChars: { min: 1098, max: 4669 },
  codeBlocks: { min: 3, max: 6 },
  longestBlockLines: { min: 12, max: 49 },
  codePercent: { min: 19, max: 47 },
  inlineCodes: { min: 1, max: 53 },
  paragraphs: { min: 14, max: 28 },
  illustrationSlots: { min: 0, max: 3 },
  resultDates: { min: 3, max: 8 },
} as const satisfies Record<keyof PostShape, { min: number; max: number }>;

/** 벗어난 항목 하나(값은 영어 코드 — 문구는 대시보드가 붙인다). `level`: off = 기준 밖, warn = 경고. */
export type PostShapeFinding =
  | {
      code: 'PROSE_CHARS_UNDER' | 'PROSE_CHARS_OVER';
      level: 'off';
      value: number;
      min: number;
      max: number;
    }
  | {
      code: 'CODE_BLOCKS_UNDER' | 'CODE_BLOCKS_OVER';
      level: 'off';
      value: number;
      min: number;
      max: number;
    }
  | { code: 'CODE_BLOCK_TOO_LONG'; level: 'warn'; value: number; limit: number }
  | { code: 'CODE_RATIO_OVER'; level: 'warn'; value: number; limit: number };

export interface PostShapeCheck {
  shape: PostShape;
  /** 기준 밖(off) → 경고(warn) 순. 없으면 빈 배열. */
  findings: PostShapeFinding[];
}

/** 본문을 재고 기준·경고 선을 벗어난 항목을 고른다. 어느 것도 승인을 막지 않는다. */
export function checkPostShape(
  body: string,
  limits: PostShapeLimits = POST_SHAPE_LIMITS,
): PostShapeCheck {
  const shape = measurePostShape(body);
  const findings: PostShapeFinding[] = [];
  const prose = limits.proseChars;
  if (shape.proseChars < prose.min || shape.proseChars > prose.max)
    findings.push({
      code: shape.proseChars < prose.min ? 'PROSE_CHARS_UNDER' : 'PROSE_CHARS_OVER',
      level: 'off',
      value: shape.proseChars,
      ...prose,
    });
  const blocks = limits.codeBlocks;
  if (shape.codeBlocks < blocks.min || shape.codeBlocks > blocks.max)
    findings.push({
      code: shape.codeBlocks < blocks.min ? 'CODE_BLOCKS_UNDER' : 'CODE_BLOCKS_OVER',
      level: 'off',
      value: shape.codeBlocks,
      ...blocks,
    });
  if (shape.longestBlockLines > limits.warnBlockLines)
    findings.push({
      code: 'CODE_BLOCK_TOO_LONG',
      level: 'warn',
      value: shape.longestBlockLines,
      limit: limits.warnBlockLines,
    });
  if (shape.codePercent > limits.warnCodePercent)
    findings.push({
      code: 'CODE_RATIO_OVER',
      level: 'warn',
      value: shape.codePercent,
      limit: limits.warnCodePercent,
    });
  return { shape, findings };
}
