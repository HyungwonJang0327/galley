// 식별 정보 필터 — decisions/evidence-collection.md "리포 인덱싱": 회사명·도메인·키·이메일·내부 URL 패턴을
// `.galley/redact.json` 한 곳에 두고, 인덱싱(summary·pointers.note)과 EvidenceBundle(snippet) 양쪽이 **같은 함수**를 쓴다.
// 패턴은 코드에 두지 않는다(CLAUDE.md §5). 실제 파일은 회사 식별 정보라 gitignore, 예시는 `.galley/redact.example.json`.
// 순수 모듈 + 파일 로더 하나. 예상된 실패는 값으로, 코드·구조 필드만(decisions/error-handling.md) — 문장은 로그 층이 붙인다.
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 규칙 하나. literal은 대소문자 무시 단어 치환(회사명 등), regex는 사용자가 쓴 정규식(도메인·이메일·키·URL). */
export type RedactRule =
  | {
      id: string;
      kind: 'literal';
      values: readonly string[];
      replacement: string;
      caseSensitive?: boolean;
    }
  | { id: string; kind: 'regex'; pattern: string; flags?: string; replacement: string };

export interface RedactConfig {
  version: 1;
  /**
   * 파일에 적힌 순서대로 적용한다. **넓은 패턴(URL·이메일·키)을 앞에, 회사명 literal을 뒤에** 두어야
   * `dev@example.com`이 `dev@[COMPANY].com`처럼 반쪽만 바뀌지 않고 `[EMAIL]`로 통째로 가려진다.
   */
  rules: readonly RedactRule[];
}

/** 설정이 왜 잘못됐는지 — 열거값. 위치는 ruleId(규칙 안 문제)·index(규칙 배열 위치)로. */
export type RedactConfigInvalidReason =
  | 'JSON'
  | 'ROOT_NOT_OBJECT'
  | 'VERSION'
  | 'RULES_NOT_ARRAY'
  | 'RULE_NOT_OBJECT'
  | 'RULE_ID'
  | 'DUPLICATE_ID'
  | 'REPLACEMENT'
  | 'LITERAL_VALUES'
  | 'CASE_SENSITIVE'
  | 'REGEX_PATTERN'
  | 'REGEX_FLAGS'
  /** 빈 문자열에도 매치되는 정규식(`x*`·`\b`) — 글자 사이마다 치환돼 텍스트가 파괴된다. */
  | 'EMPTY_MATCH'
  | 'KIND'
  /** 이 규칙의 replacement가 뒤에 오는 literal 규칙의 값에 잡힌다(`[KEY]` → `[[COMPANY]]`). */
  | 'REPLACEMENT_COLLISION';

export type RedactConfigFailure =
  | { ok: false; code: 'REDACT_CONFIG_MISSING' }
  | { ok: false; code: 'REDACT_CONFIG_UNREADABLE' }
  | {
      ok: false;
      code: 'REDACT_CONFIG_INVALID';
      reason: RedactConfigInvalidReason;
      ruleId?: string;
      index?: number;
    };
export type RedactConfigResult = { ok: true; config: RedactConfig } | RedactConfigFailure;

export interface RedactHit {
  ruleId: string;
  count: number;
}
export interface RedactResult {
  text: string;
  /** 하나라도 **치환됐으면** true. "필터를 거쳤는가"는 저장 쪽 `filtered`가 따로 기록한다(evidence-collection 2026-09-21). */
  redacted: boolean;
  hits: RedactHit[];
}

const ALLOWED_FLAGS = new Set(['i', 'm', 's', 'u']);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function invalid(
  reason: RedactConfigInvalidReason,
  where: { ruleId?: string; index?: number } = {},
): RedactConfigFailure {
  return { ok: false, code: 'REDACT_CONFIG_INVALID', reason, ...where };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 길이 0 매치가 나오는 정규식인가 — `x*`·`\b`·`(?=a)`. 표본 몇 개로 확인한다(`\b`는 빈 문자열엔 안 붙는다). */
function matchesEmpty(re: RegExp): boolean {
  for (const sample of ['', 'a', 'a b', '가 1']) {
    re.lastIndex = 0;
    const m = re.exec(sample);
    if (m !== null && m[0].length === 0) return true;
  }
  re.lastIndex = 0;
  return false;
}

function toRegExp(rule: RedactRule): RegExp {
  if (rule.kind === 'regex') return new RegExp(rule.pattern, `g${rule.flags ?? ''}`);
  // 긴 값부터 — "Example Corp"가 "Example"보다 먼저 잡혀야 잔여 조각이 남지 않는다.
  const alternatives = [...rule.values].sort((a, b) => b.length - a.length).map(escapeRegExp);
  return new RegExp(alternatives.join('|'), rule.caseSensitive ? 'g' : 'gi');
}

function parseRule(
  raw: unknown,
  index: number,
  seen: Set<string>,
): RedactRule | RedactConfigFailure {
  if (!isRecord(raw)) return invalid('RULE_NOT_OBJECT', { index });
  const id = raw['id'];
  if (typeof id !== 'string' || id === '') return invalid('RULE_ID', { index });
  if (seen.has(id)) return invalid('DUPLICATE_ID', { ruleId: id, index });
  seen.add(id);
  const where = { ruleId: id, index };
  const replacement = raw['replacement'];
  if (typeof replacement !== 'string') return invalid('REPLACEMENT', where);
  if (raw['kind'] === 'literal') {
    const values = raw['values'];
    if (!isStringArray(values) || values.length === 0 || values.some((v) => v.trim() === ''))
      return invalid('LITERAL_VALUES', where);
    const caseSensitive = raw['caseSensitive'];
    if (caseSensitive !== undefined && typeof caseSensitive !== 'boolean')
      return invalid('CASE_SENSITIVE', where);
    return {
      id,
      kind: 'literal',
      values,
      replacement,
      ...(caseSensitive === undefined ? {} : { caseSensitive }),
    };
  }
  if (raw['kind'] === 'regex') {
    const pattern = raw['pattern'];
    if (typeof pattern !== 'string' || pattern === '') return invalid('REGEX_PATTERN', where);
    const flags = raw['flags'];
    if (flags !== undefined) {
      if (typeof flags !== 'string') return invalid('REGEX_FLAGS', where);
      const chars = [...flags];
      if (chars.some((f) => !ALLOWED_FLAGS.has(f)) || new Set(chars).size !== chars.length)
        return invalid('REGEX_FLAGS', where);
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern, `g${flags ?? ''}`);
    } catch {
      return invalid('REGEX_PATTERN', where);
    }
    if (matchesEmpty(re)) return invalid('EMPTY_MATCH', where);
    return { id, kind: 'regex', pattern, replacement, ...(flags === undefined ? {} : { flags }) };
  }
  return invalid('KIND', where);
}

/** JSON으로 읽은 값을 검증해 RedactConfig로. 정규식은 여기서 컴파일해 보고 깨졌으면 규칙 위치와 함께 거부한다. */
export function parseRedactConfig(json: unknown): RedactConfigResult {
  if (!isRecord(json)) return invalid('ROOT_NOT_OBJECT');
  if (json['version'] !== 1) return invalid('VERSION');
  const rawRules = json['rules'];
  if (!Array.isArray(rawRules)) return invalid('RULES_NOT_ARRAY');
  const seen = new Set<string>();
  const rules: RedactRule[] = [];
  for (const [index, raw] of rawRules.entries()) {
    const parsed = parseRule(raw, index, seen);
    if ('ok' in parsed) return parsed;
    rules.push(parsed);
  }
  // 앞 규칙이 넣은 치환 토큰을 뒤 literal 규칙이 다시 잡으면 `[KEY]` → `[[COMPANY]]`. 기계적으로 잡을 수 있는 유일한 순서 문제.
  for (const [i, rule] of rules.entries()) {
    for (const later of rules.slice(i + 1)) {
      if (later.kind !== 'literal') continue;
      if (toRegExp(later).test(rule.replacement))
        return invalid('REPLACEMENT_COLLISION', { ruleId: rule.id, index: i });
    }
  }
  return { ok: true, config: { version: 1, rules } };
}

/** 파일에서 읽는다. 없으면 MISSING, 못 읽으면(권한·디렉터리) UNREADABLE, JSON이 깨졌거나 형식이 틀리면 INVALID. */
export async function loadRedactConfig(path: string): Promise<RedactConfigResult> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    const code = isRecord(error) ? error['code'] : undefined;
    if (code === 'ENOENT') return { ok: false, code: 'REDACT_CONFIG_MISSING' };
    return { ok: false, code: 'REDACT_CONFIG_UNREADABLE' };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return invalid('JSON');
  }
  return parseRedactConfig(json);
}

/**
 * 기본 경로. `.env`의 `REDACT_CONFIG_PATH`가 있으면 그것(다른 경로들과 같은 규칙 — 주입), 없으면 리포 루트
 * `.galley/redact.json`(이 파일 위치에서 파생 — 소스 트리 전용 폴백. 번들·다른 패키지에서 실행하면 env를 쓴다).
 */
export function defaultRedactConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env['REDACT_CONFIG_PATH'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv;
  // `new URL('...json', import.meta.url)`은 번들러(Turbopack)가 정적 자산으로 해석해 gitignore된 파일을 찾다 빌드가
  // 깨진다 — 문자열 경로 계산만 한다.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..', '.galley', 'redact.json');
}

/**
 * 문자열에 규칙을 순서대로 적용한다. 순수 함수 — 입력을 바꾸지 않고 치환 결과·규칙별 적중 수를 돌려준다.
 * 빈 매치(길이 0)는 치환하지 않고 세지 않는다(parse가 이미 거부하지만 이중 방어). 규칙·적중이 없으면 text 그대로.
 */
export function redact(text: string, config: RedactConfig): RedactResult {
  let out = text;
  const hits: RedactHit[] = [];
  for (const rule of config.rules) {
    const re = toRegExp(rule);
    let count = 0;
    out = out.replace(re, (match) => {
      if (match.length === 0) return match;
      count += 1;
      return rule.replacement;
    });
    if (count > 0) hits.push({ ruleId: rule.id, count });
  }
  return { text: out, redacted: hits.length > 0, hits };
}
