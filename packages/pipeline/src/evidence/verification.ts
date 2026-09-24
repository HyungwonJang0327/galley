// VerificationReport — 근거 검증 단계의 산출물(decisions/evidence-collection.md "근거 검증"). 초안의 **주장**만 담고 코드 조각은
// 담지 않는다(posts로 복사돼도 회사 코드가 새지 않게 — 클린룸 검사도 위치·줄 수만 남긴다). 여기는 순수 함수뿐이다:
// 주장 추출(정규식) · 번들 대조(문자열) · 서술 문장 추출(모델 판정은 단계가) · 클린룸 검사. 파일·모델·DB를 모른다.
import type { EvidenceBundle, EvidenceItem } from './bundle.ts';
import { VERIFY_LIMITS, type VerifyLimits } from './verifyLimits.ts';

export type ClaimKind = 'number' | 'path' | 'identifier' | 'statement';
export type ClaimStatus = 'supported' | 'unsupported' | 'uncertain';

/** 근거 조각을 가리키는 포인터 — 조각 본문 없음. */
export interface EvidenceRef {
  commit: string;
  path: string;
  lineRange: { start: number; end: number };
}

/**
 * 판정 사유 코드 — 값은 영어 코드만, 한국어 문구는 앱이 붙인다(decisions/db-value-language.md 취지).
 * 기계: `not-in-evidence`(숫자 미발견) · `generalizable`(경로·식별자 미발견 — 어투가 일반화를 강제) · `in-analysis-summary`(요약에서만).
 * 서술: `judged`(모델 판정, `note`에 사유) · `not-judged`(상한 초과) · `judge-missing`(모델이 id를 빠뜨림) · `judge-unparsed` · `judge-truncated`.
 */
export type ClaimReason =
  | 'not-in-evidence'
  | 'generalizable'
  | 'in-analysis-summary'
  | 'judged'
  | 'not-judged'
  | 'judge-missing'
  | 'judge-unparsed'
  | 'judge-truncated';

export interface VerificationClaim {
  /** 주장 원문(숫자·경로·식별자는 토큰, 서술은 문장). 본문에서 온 텍스트뿐이다. */
  text: string;
  kind: ClaimKind;
  status: ClaimStatus;
  /** 본문(velog.md)에서의 줄 번호(1부터) — 타임라인 펼침·Phase 2 밑줄용. */
  line: number;
  /** supported일 때 첫 번째로 맞은 조각. */
  evidenceRef?: EvidenceRef;
  /** 판정 사유 코드. */
  reason?: ClaimReason;
  /** 모델 판정의 한 줄 사유(서술만). 근거 조각 인용은 단계가 걸러낸다. */
  note?: string;
}

/** 본문이 근거 조각을 N줄 이상 그대로 담은 자리 — 텍스트 없이 위치·줄 수만. */
export interface VerbatimMatch {
  evidenceRef: EvidenceRef;
  /** 본문 줄 번호(1부터). */
  bodyLine: number;
  /** 조각 안 줄 번호(원본 파일 기준, lineRange.start + 오프셋). */
  snippetLine: number;
  lines: number;
}

export interface VerificationReport {
  version: 1;
  runId: string;
  topicSlug: string;
  verifiedAt: string;
  /** 대조한 본문·번들을 만든 Run(carried면 이 Run과 다르다). */
  sources: { velog: string; evidence: string };
  claims: VerificationClaim[];
  counts: Record<ClaimStatus, number>;
  cleanRoom: { threshold: number; matches: VerbatimMatch[] };
  /** 서술 판정 — 모델을 안 불렀으면(서술 0개) `skipped`, 출력이 깨졌거나 잘렸으면 전부 uncertain으로 두고 여기 남긴다. */
  judge:
    | { status: 'skipped' }
    | { status: 'judged'; model: string; statements: number }
    | { status: 'unparsed' | 'truncated'; model: string; statements: number };
}

/**
 * 본문 줄 — `inCode`(코드 펜스·4칸 들여쓰기 블록)·`inComment`(여러 줄 HTML 주석)는 주장·서술 추출에서 뺀다.
 * 클린룸 검사는 모든 줄을 본다.
 */
export interface BodyLine {
  line: number;
  text: string;
  inCode: boolean;
  inComment: boolean;
}

export function splitBodyLines(body: string): BodyLine[] {
  const out: BodyLine[] = [];
  let fence: string | undefined;
  let inComment = false;
  let indented = false; // 4칸 들여쓰기 코드 블록 안
  let prevBlank = true;
  let lastNonBlankWasList = false;
  body.split(/\r?\n/).forEach((text, i) => {
    const line = i + 1;
    const blank = text.trim() === '';
    if (fence !== undefined) {
      out.push({ line, text, inCode: true, inComment: false });
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(text); // 닫는 펜스는 info string 없이
      if (close !== null && close[1]!.startsWith(fence[0]!) && close[1]!.length >= fence.length)
        fence = undefined;
      return;
    }
    if (inComment) {
      out.push({ line, text, inCode: false, inComment: true });
      if (text.includes('-->')) inComment = false;
      return;
    }
    const open = /^\s*(`{3,}|~{3,})/.exec(text);
    if (open !== null) {
      fence = open[1]!;
      indented = false;
      out.push({ line, text, inCode: true, inComment: false });
      prevBlank = false;
      return;
    }
    // 4칸(또는 탭) 들여쓰기 코드 블록: 빈 줄 뒤에 시작하고 직전 문단이 목록이 아닐 때(목록 이어쓰기와 구분)
    if (/^(?: {4}|\t)/.test(text) && (indented || (prevBlank && !lastNonBlankWasList))) {
      indented = true;
      out.push({ line, text, inCode: true, inComment: false });
      prevBlank = false;
      return;
    }
    if (!blank) indented = false;
    // 한 줄에서 열리고 안 닫힌 HTML 주석 → 다음 줄부터 주석
    const stripped = text.replace(/<!--[\s\S]*?-->/g, '');
    const opensComment = stripped.includes('<!--');
    out.push({ line, text, inCode: false, inComment: false });
    if (opensComment) inComment = true;
    if (!blank) lastNonBlankWasList = /^\s*(?:[-*+]|\d+[.)])\s+/.test(text);
    prevBlank = blank;
  });
  return out;
}

/** 산문 줄에서 HTML 주석·링크 URL·이미지를 뺀다(주석 속 [확인 필요] 문구가 주장으로 잡히지 않게). 열린 주석 뒤도 뗀다. */
function proseOnly(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!--[\s\S]*$/, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\]\([^)]*\)/g, '] ');
}

/** 소스 파일로 볼 확장자 — 경로 판정(산문·인라인 백틱)이 공유한다. */
const SOURCE_EXT = 'tsx?|jsx?|mjs|cjs|json|md|py|css|scss|ya?ml|sql|prisma|sh|env|toml|html';
/** 경로 구간 — 끝에 마침표가 남지 않게 `a.b`는 안쪽 점만 허용. */
const PATH_SEG = '[\\w@-]+(?:\\.[\\w@-]+)*';
// 앞은 경로 문자가 아닌 것, 뒤도 경로 문자가 아닌 것(한글 조사 포함) 또는 문장 끝 마침표.
const PATH_LIKE = new RegExp(
  `(?<![\\w@/.-])((?:${PATH_SEG}/)+${PATH_SEG}/?|[\\w-]+\\.(?:${SOURCE_EXT}))(?=$|[^\\w@/.-]|\\.(?!\\w))`,
  'g',
);
// 식별자 — 호출 `name(`(인자 유무 무관) · camelCase · PascalCase · snake_case. 반복 그룹은 대문자마다 하나만 가능하게
// (`[A-Z][a-z\d_$]*`) 두어 대문자 연속에서 지수 백트래킹이 없다(리뷰 H2).
const IDENT_LIKE =
  /(?<![\w$`])(?:([A-Za-z_$][\w$]*)(?=\()|([a-z][a-z\d]*(?:[A-Z][a-z\d_$]*)+|[A-Z][a-z\d]+(?:[A-Z][a-z\d_$]*)+|[A-Za-z][A-Za-z\d]*(?:_[\w]+)+)(?=$|[^\w$`(]))/g;
/** ISO 날짜는 통째로 하나의 주장(조각 `date`와 대조). 먼저 뽑고 지운다. */
const ISO_DATE = /(?<![\w-])(\d{4}-\d{2}(?:-\d{2})?)(?![\w-]|[-:.]\d)/g;
// 숫자 — 앞뒤가 `-`·`:`·`.`+숫자면(날짜·시간·버전 조각) 잡지 않는다.
const NUMBER_LIKE =
  /(?<![\w.,:-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(%|ms|초|분|시간|일|주|개월|월|년|개|건|배|명|회|줄|장|페이지|MB|KB|GB|TB|px|원|달러|ｍｓ)?(?=$|[^\d\w%]|[\w%](?<![-:.]\d))(?![-:.]\d)/gu;

/** 인라인 백틱 코드를 경로/식별자로 분류한다. 여러 단어·공백이 있으면 식별자가 아니라 코드 조각이라 뺀다. */
function classifyInlineCode(code: string): ClaimKind | undefined {
  const t = code.trim();
  if (t === '' || /\s/.test(t)) return undefined;
  if (/\//.test(t) || new RegExp(`\\.(?:${SOURCE_EXT})$`).test(t)) return 'path';
  if (/^[A-Za-z_$][\w$.]*(?:\(\))?$/.test(t) || /^[A-Z][A-Z\d_]+$/.test(t)) return 'identifier';
  return undefined;
}

/**
 * 산문에서 기계 대조용 주장을 뽑는다 — 인라인 백틱(경로/식별자), 경로 꼴, 식별자 꼴(camelCase·PascalCase·snake·호출),
 * 숫자(천 단위 콤마·소수·단위)·ISO 날짜(통째). 목록 번호·제목 번호·단위 없는 연도·단위 없는 한 자리 수·날짜/시간/버전의 조각(`03`·`30`·`19.2`)은 뺀다
 * (`2024년`·`2024-03-05`는 날짜 주장으로 남긴다). 같은 (kind, text)는 첫 줄만.
 */
export function extractMechanicalClaims(lines: readonly BodyLine[]): VerificationClaim[] {
  const seen = new Set<string>();
  const out: VerificationClaim[] = [];
  const push = (kind: ClaimKind, text: string, line: number) => {
    const key = `${kind}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ text, kind, status: 'uncertain', line });
  };
  for (const { line, text: raw, inCode, inComment } of lines) {
    if (inCode || inComment) continue;
    let text = proseOnly(raw);
    // 인라인 백틱 코드 먼저 떼어 낸다(안의 내용은 여기서만 분류하고 산문 검사에서는 뺀다)
    text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
      const kind = classifyInlineCode(code);
      if (kind !== undefined) push(kind, code.trim(), line);
      return ' ';
    });
    // 목록·제목 번호 제거
    text = text.replace(/^\s*(?:#{1,6}\s+)?(?:\d+\.|\d+\))\s+/, ' ');
    // 경로를 먼저 뽑고 지운다(경로 조각이 식별자·숫자로 다시 잡히지 않게)
    text = text.replace(PATH_LIKE, (m0, p: string) => {
      push('path', p, line);
      return ' '.repeat(m0.length);
    });
    for (const m of text.matchAll(IDENT_LIKE)) {
      const id = m[1] !== undefined ? `${m[1]}()` : m[2]!;
      if (/^(?:https?|www)(?:\(\))?$/i.test(id)) continue;
      push('identifier', id, line);
    }
    text = text.replace(ISO_DATE, (m0, d: string) => {
      push('number', d, line);
      return ' '.repeat(m0.length);
    });
    for (const m of text.matchAll(NUMBER_LIKE)) {
      const whole = m[1]!;
      const frac = m[2];
      const unit = m[3];
      const digits = whole.replace(/,/g, '');
      if (unit === undefined) {
        if (digits.length === 1) continue; // "3가지"처럼 단위가 어절에 붙지 않은 한 자리 수는 잡음
        if (/^(?:19|20)\d\d$/.test(digits) && frac === undefined) continue; // 연도 단독
      }
      const token = `${whole}${frac === undefined ? '' : `.${frac}`}${unit === undefined ? '' : unit}`;
      push('number', token, line);
    }
  }
  return out;
}

/**
 * 산문에서 "~다."로 끝나는 서술 문장을 뽑는다(모델 판정 대상). 제목·목록 기호·인용 표시는 떼고, 길이 상한 밖은 뺀다.
 * 물음·느낌표로 끝나는 문장은 주장으로 보지 않는다.
 * 백틱·숫자만 있는 문장도 사실 진술이므로 포함한다 — 기계 대조와 겹쳐도 판정 축이 다르다.
 */
export function extractStatements(
  lines: readonly BodyLine[],
  limits: VerifyLimits = VERIFY_LIMITS,
): VerificationClaim[] {
  const out: VerificationClaim[] = [];
  const seen = new Set<string>();
  for (const { line, text: raw, inCode, inComment } of lines) {
    if (inCode || inComment) continue;
    if (/^\s*#{1,6}\s/.test(raw)) continue;
    const text = proseOnly(raw)
      .replace(/^\s*(?:[-*+]|\d+[.)]|>)\s+/, '')
      .trim();
    if (text === '') continue;
    // 문장 경계는 "~다." 같은 종결 어미 뒤의 공백에서만 — `.ts`·`1.5` 같은 마침표로는 끊지 않는다.
    for (const piece of text.split(/(?<=(?:다|요|음|임|함|됨)[.。!?])\s+/)) {
      const sentence = piece.trim();
      if (!/(?:다|요|음|임|함|됨)[.。]$/.test(sentence)) continue;
      if (sentence.length < limits.statementMinChars || sentence.length > limits.statementMaxChars)
        continue;
      if (seen.has(sentence)) continue;
      seen.add(sentence);
      out.push({ text: sentence, kind: 'statement', status: 'uncertain', line });
    }
  }
  return out;
}

const refOf = (item: EvidenceItem): EvidenceRef => ({
  commit: item.commit,
  path: item.path,
  lineRange: item.lineRange,
});
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 기계 주장을 번들과 대조한다. 대조 대상은 조각 본문·note·경로·날짜·분석 글 요약이다.
 * - number: 콤마를 뗀 값이 토큰 경계로 나오면 supported, 아니면 **unsupported**(숫자는 일반화 대상이 아니다).
 * - path·identifier: 나오면 supported, 아니면 **uncertain** — 어투가 회사 고유 이름을 일반 이름으로 바꾸게 하므로
 *   못 찾은 것이 곧 지어낸 것은 아니다(decisions 2026-09-23 BS2 ⑬).
 */
export function matchMechanicalClaims(
  claims: readonly VerificationClaim[],
  bundle: EvidenceBundle,
): VerificationClaim[] {
  // 천 단위 콤마는 양쪽에서 뗀다(본문 `1000` ↔ 조각 `1,000` 대칭)
  const plain = (t: string): string => t.replace(/(?<=\d),(?=\d{3}(?!\d))/g, '');
  const haystacks = bundle.items.map((item) => ({
    item,
    text: plain([item.snippet, item.note ?? '', item.path, item.date.slice(0, 10)].join('\n')),
  }));
  const summaries = plain(
    (bundle.analyses ?? []).map((a) => `${a.title}\n${a.summary}`).join('\n'),
  );
  const find = (pattern: RegExp): EvidenceItem | 'summary' | undefined => {
    for (const h of haystacks) if (pattern.test(h.text)) return h.item;
    return pattern.test(summaries) ? 'summary' : undefined;
  };
  return claims.map((claim) => {
    let pattern: RegExp;
    if (claim.kind === 'number') {
      const m = /^(\d{4}-\d{2}(?:-\d{2})?|[\d,]+(?:\.\d+)?)/.exec(claim.text)!;
      const value = m[1]!.replace(/,/g, '');
      // 값만 본다(단위는 안 본다). 앞뒤 숫자·소수점은 차단(`20` ≠ `120`·`2024`·`0.20`·`20.5`)
      pattern = new RegExp(`(?<![\\d.])${escapeRegExp(value)}(?![\\d]|\\.\\d)`);
    } else if (claim.kind === 'path') {
      const tail = claim.text.replace(/^\.?\//, '');
      pattern = new RegExp(`(?<![\\w])${escapeRegExp(tail)}(?![\\w])`); // 뒤쪽 경로 일치(앞에 디렉터리가 더 있어도)
    } else {
      const bare = claim.text.replace(/\(\)$/, '').split('.').pop()!;
      pattern = new RegExp(`(?<![\\w$])${escapeRegExp(bare)}(?![\\w$])`);
    }
    const hit = find(pattern);
    if (hit === undefined) {
      return claim.kind === 'number'
        ? { ...claim, status: 'unsupported', reason: 'not-in-evidence' }
        : { ...claim, status: 'uncertain', reason: 'generalizable' };
    }
    return hit === 'summary'
      ? { ...claim, status: 'supported', reason: 'in-analysis-summary' }
      : { ...claim, status: 'supported', evidenceRef: refOf(hit) };
  });
}

/** 공백을 정규화한 줄 — 공백 제외 `min`자 미만이면 undefined(비교에서 뺀다). 판정 사유 검열도 같은 기준을 쓴다. */
export const significant = (text: string, min: number): string | undefined => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.replace(/\s/g, '').length >= min ? t : undefined;
};

/**
 * 클린룸 기계 검사 — 근거 조각의 `threshold`줄 이상이 본문에 **연속으로 그대로** 있으면 위치만 기록한다.
 * 짧은 줄(`}` 등)은 양쪽에서 빼고 비교한다. 본문 코드 펜스 안팎을 가리지 않는다(산문에 붙여 넣은 코드도 잡는다).
 */
export function findVerbatimRuns(
  lines: readonly BodyLine[],
  bundle: EvidenceBundle,
  limits: VerifyLimits = VERIFY_LIMITS,
): VerbatimMatch[] {
  const body: { line: number; text: string }[] = [];
  for (const l of lines) {
    const t = significant(l.text, limits.cleanRoomMinLineChars);
    if (t !== undefined) body.push({ line: l.line, text: t });
  }
  const index = new Map<string, number[]>();
  body.forEach((b, i) => {
    const arr = index.get(b.text);
    if (arr === undefined) index.set(b.text, [i]);
    else arr.push(i);
  });
  const matches: VerbatimMatch[] = [];
  for (const item of bundle.items) {
    const snippet: { offset: number; text: string }[] = [];
    item.snippet.split(/\r?\n/).forEach((text, offset) => {
      const t = significant(text, limits.cleanRoomMinLineChars);
      if (t !== undefined) snippet.push({ offset, text: t });
    });
    let i = 0;
    while (i < snippet.length) {
      let best = 0;
      let bestStart = -1;
      for (const j of index.get(snippet[i]!.text) ?? []) {
        let k = 0;
        while (
          i + k < snippet.length &&
          j + k < body.length &&
          snippet[i + k]!.text === body[j + k]!.text
        )
          k += 1;
        if (k > best) {
          best = k;
          bestStart = j;
        }
      }
      if (best >= limits.cleanRoomLines) {
        matches.push({
          evidenceRef: refOf(item),
          bodyLine: body[bestStart]!.line,
          snippetLine: item.lineRange.start + snippet[i]!.offset,
          lines: best,
        });
        i += best;
      } else i += 1;
    }
  }
  return matches;
}

export function countClaims(claims: readonly VerificationClaim[]): Record<ClaimStatus, number> {
  const counts: Record<ClaimStatus, number> = { supported: 0, unsupported: 0, uncertain: 0 };
  for (const c of claims) counts[c.status] += 1;
  return counts;
}
