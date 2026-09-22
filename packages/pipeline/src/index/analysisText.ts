// 분석 글(area·change·overview) 공통 — 모델 출력에서 JSON을 뽑고, 저장되는 텍스트를 redact하고, 제목·키워드를 상한 안으로
// 다듬는다. 종류별 모듈(areaAnalysis·changeAnalysis·overviewAnalysis)은 프롬프트와 포인터 규칙만 다르다.
import { redact, type RedactConfig } from '../evidence/redact.ts';
import type { ModelUsage } from '../model/ModelAdapter.ts';
import { OUTPUT_LIMITS } from './limits.ts';

export type AnalysisFailure =
  /** 모델은 답했지만 쓸 수 없는 답 — 과금은 됐으므로 usage를 싣는다. 호출자는 건너뛰고 기록한다. */
  | { ok: false; code: 'MODEL_OUTPUT_INVALID'; usage: ModelUsage; costUsd: number }
  /** 모델 호출 자체가 실패(키·네트워크·429) — 출력 불량과 다른 종류. 호출자는 중단한다. */
  | { ok: false; code: 'MODEL_FAILED'; errorName: string };

export const modelFailed = (error: unknown): AnalysisFailure => ({
  ok: false,
  code: 'MODEL_FAILED',
  errorName: error instanceof Error ? error.name : 'UnknownError',
});

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** 모델 출력에서 JSON 객체 하나를 뽑는다 — 코드 펜스를 먼저, 실패하면 전체 텍스트의 첫 `{`~마지막 `}`. */
export function extractJson(text: string): unknown {
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const parsed = parseObject(m[1]!);
    if (isRecord(parsed)) return parsed;
  }
  return parseObject(text);
}

/** title·summary가 비어 있지 않은 문자열인지 — 분석 글의 최소 조건. */
export function readTitleSummary(json: unknown): { title: string; summary: string } | undefined {
  if (!isRecord(json)) return undefined;
  const title = json['title'];
  const summary = json['summary'];
  if (
    typeof title !== 'string' ||
    title.trim() === '' ||
    typeof summary !== 'string' ||
    summary.trim() === ''
  )
    return undefined;
  return { title: title.trim(), summary: summary.trim() };
}

export interface Redactor {
  /** 설정이 없으면 그대로(filtered=false). */
  apply(text: string): string;
  /** 지금까지 한 번이라도 치환이 있었는가 → RepoAnalysis.redacted. */
  readonly redacted: boolean;
  readonly filtered: boolean;
}

/** 저장되는 텍스트 전부(title·summary·keywords·note)에 같은 필터를 적용하고 치환 여부를 모은다. */
export function createRedactor(config: RedactConfig | null): Redactor {
  let redacted = false;
  return {
    apply(text: string): string {
      if (config === null) return text;
      const r = redact(text, config);
      if (r.redacted) redacted = true;
      return r.text;
    },
    get redacted() {
      return redacted;
    },
    filtered: config !== null,
  };
}

/** 키워드: 문자열만, redact → 소문자 → 글자 상한 → 빈 것 제거 → 중복 제거(순서 유지) → 개수 상한. */
export function cleanKeywords(raw: unknown, redactor: Redactor): string[] {
  return [
    ...new Set(
      (Array.isArray(raw) ? raw : [])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => redactor.apply(k).trim().toLowerCase().slice(0, OUTPUT_LIMITS.keywordChars))
        .filter((k) => k !== ''),
    ),
  ].slice(0, OUTPUT_LIMITS.keywords);
}

export const cleanTitle = (title: string, redactor: Redactor): string =>
  redactor.apply(title).slice(0, OUTPUT_LIMITS.titleChars);
