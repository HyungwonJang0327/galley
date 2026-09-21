// 영역(area) 분석 글 생성 — 모델에 "이 디렉터리가 무엇을 하는가"를 묻고 한국어 요약·키워드·포인터를 받아 검증한다.
// 모델은 ModelAdapter 하나로만 부른다(provider를 모른다 — decisions/model-selection.md). 저장되는 텍스트(title·summary·
// keywords·pointer.note)는 전부 redact를 거친다. 포인터는 commit 기준·실제 읽은 파일·실제 줄 범위만 — 저장 규칙(≥ 1)을 만족시킨다.
import type { ModelAdapter, ModelUsage } from '../model/ModelAdapter.ts';
import { redact, type RedactConfig } from '../evidence/redact.ts';
import { OUTPUT_LIMITS } from './limits.ts';
import type { EvidencePointer } from './schema.ts';
import type { AreaPlan } from './tree.ts';

export interface AreaFileContent {
  path: string;
  text: string;
}

export interface AreaAnalysisInput {
  repoName: string;
  commit: string;
  plan: AreaPlan;
  /** 실제로 읽은 본문 — 이것이 "본문을 넘긴 파일"의 진실이다(plan.include가 아니라). 읽기에 실패한 파일은 여기 없다. */
  contents: readonly AreaFileContent[];
  /** null이면 필터 없이 진행(filtered=false로 저장된다 — 호출자가 readOnly 리포에서는 막는다). */
  redactConfig: RedactConfig | null;
}

export interface AreaAnalysisDraft {
  kind: 'area';
  key: string;
  title: string;
  summary: string;
  keywords: string[];
  pointers: EvidencePointer[];
  period: null;
  summaryOnly: boolean;
  modelId: string;
  usage: ModelUsage;
  costUsd: number;
  filtered: boolean;
  redacted: boolean;
}

export type AreaAnalysisFailure =
  /** 모델은 답했지만 쓸 수 없는 답 — 과금은 됐으므로 usage를 싣는다. 호출자는 건너뛰고 기록한다. */
  | { ok: false; code: 'MODEL_OUTPUT_INVALID'; usage: ModelUsage; costUsd: number }
  /** 모델 호출 자체가 실패(키·네트워크·429) — 출력 불량과 다른 종류. 호출자는 중단한다. */
  | { ok: false; code: 'MODEL_FAILED'; errorName: string };
export type AreaAnalysisResult = { ok: true; draft: AreaAnalysisDraft } | AreaAnalysisFailure;

const SYSTEM_PROMPT = `당신은 코드 리포지토리를 읽고 기술 블로그 초안의 근거가 될 "분석 글"을 쓰는 분석가입니다.
주어진 디렉터리의 파일 목록과 본문을 읽고 아래 JSON 하나만 출력하세요(코드 펜스·설명 없이).
{
  "title": "디렉터리가 하는 일을 한 줄로(한국어)",
  "summary": "무엇을·왜·어떻게 구현했는지 3~6문장(한국어). 구체적 함수·타입·파일 이름을 포함하되 회사·고객 식별 정보는 쓰지 마세요.",
  "keywords": ["소문자 영문 또는 한국어 키워드 5~12개 — 기술·패턴·도메인 개념"],
  "pointers": [{ "path": "본문에 있던 파일 경로", "lineStart": 1, "lineEnd": 20, "note": "이 조각이 보여주는 것 한 줄" }]
}
pointers는 요약의 근거가 되는 조각 1~6개. path는 반드시 본문이 있는 파일의 경로, 라인 범위는 선택입니다.
본문이 하나도 없으면(파일명만 주어진 경우) 파일명·구조에서 알 수 있는 것만 요약하고 pointers는 빈 배열로 두세요.`;

function buildPrompt(input: AreaAnalysisInput): string {
  const { plan, contents } = input;
  const byPath = new Map(contents.map((c) => [c.path, c.text] as const));
  const lines: string[] = [
    `리포지토리: ${input.repoName}`,
    `디렉터리: ${plan.dir}`,
    `파일 ${plan.files.length}개${byPath.size < plan.files.length ? ' (일부는 이름만 — 입력 상한 초과 또는 읽기 제외)' : ''}`,
    '',
    '## 파일 목록',
    ...plan.files.map(
      (f) => `- ${f.path} (${f.size} bytes${byPath.has(f.path) ? '' : ', 이름만'})`,
    ),
    '',
    '## 본문',
  ];
  for (const f of plan.files) {
    const text = byPath.get(f.path);
    if (text === undefined) continue;
    lines.push(`### ${f.path}`, '```', text, '```', '');
  }
  return lines.join('\n');
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
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
function extractJson(text: string): unknown {
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const parsed = parseObject(m[1]!);
    if (isRecord(parsed)) return parsed;
  }
  return parseObject(text);
}

const posInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : undefined;
/** 줄 수 — 끝의 개행은 빈 줄로 세지 않는다(에디터가 보는 줄 번호와 같게). */
const lineCount = (text: string): number =>
  text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;

/**
 * 모델 호출 → JSON 검증 → redact → 포인터 보정.
 * 포인터: 실제 읽은 파일만 인정, 라인은 파일 줄 수 안으로(시작이 넘으면 버림, 끝이 넘으면 clamp).
 * 유효한 포인터가 없으면 읽은 파일 전체를 포인터로, 읽은 파일도 없으면(전부 상한 초과) 계획의 파일 전체를 라인 없는
 * 포인터로 삼아 summaryOnly 글을 남긴다(경로는 커밋에 실존 — decisions ④ 2026-09-22).
 */
export async function analyzeArea(
  adapter: ModelAdapter,
  input: AreaAnalysisInput,
): Promise<AreaAnalysisResult> {
  let generated;
  try {
    generated = await adapter.generate({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      maxOutputTokens: 2048,
    });
  } catch (error) {
    return {
      ok: false,
      code: 'MODEL_FAILED',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    };
  }
  const invalid = (): AreaAnalysisFailure => ({
    ok: false,
    code: 'MODEL_OUTPUT_INVALID',
    usage: generated.usage,
    costUsd: generated.costUsd,
  });
  const json = extractJson(generated.text);
  if (!isRecord(json)) return invalid();
  const title = json['title'];
  const summary = json['summary'];
  if (
    typeof title !== 'string' ||
    title.trim() === '' ||
    typeof summary !== 'string' ||
    summary.trim() === ''
  )
    return invalid();

  const lengths = new Map(input.contents.map((c) => [c.path, lineCount(c.text)] as const));
  const rawPointers = Array.isArray(json['pointers']) ? json['pointers'] : [];
  const pointers: EvidencePointer[] = [];
  for (const p of rawPointers) {
    if (!isRecord(p) || typeof p['path'] !== 'string') continue;
    const total = lengths.get(p['path']);
    if (total === undefined) continue;
    let lineStart = posInt(p['lineStart']);
    let lineEnd = posInt(p['lineEnd']);
    if (lineStart !== undefined && lineEnd !== undefined && lineStart > lineEnd)
      [lineStart, lineEnd] = [lineEnd, lineStart];
    if (lineStart !== undefined && lineStart > total) continue;
    if (lineEnd !== undefined && lineEnd > total) lineEnd = total;
    pointers.push({
      commit: input.commit,
      path: p['path'],
      ...(lineStart !== undefined ? { lineStart } : {}),
      ...(lineEnd !== undefined ? { lineEnd } : {}),
      ...(typeof p['note'] === 'string' && p['note'].trim() !== ''
        ? { note: p['note'].trim() }
        : {}),
    });
  }
  if (pointers.length === 0) {
    const fallback =
      input.contents.length > 0
        ? input.contents.map((c) => c.path)
        : input.plan.files.map((f) => f.path);
    for (const path of fallback) pointers.push({ commit: input.commit, path });
  }
  if (pointers.length === 0) return invalid();

  // redact: 저장되는 텍스트 전부(title·summary·keywords·note). 설정이 없으면 그대로(filtered=false).
  let redacted = false;
  const apply = (text: string): string => {
    if (input.redactConfig === null) return text;
    const r = redact(text, input.redactConfig);
    if (r.redacted) redacted = true;
    return r.text;
  };
  const keywords = [
    ...new Set(
      (Array.isArray(json['keywords']) ? json['keywords'] : [])
        .filter((k): k is string => typeof k === 'string')
        .map((k) => apply(k).trim().toLowerCase().slice(0, OUTPUT_LIMITS.keywordChars))
        .filter((k) => k !== ''),
    ),
  ].slice(0, OUTPUT_LIMITS.keywords);
  const cleanTitle = apply(title.trim()).slice(0, OUTPUT_LIMITS.titleChars);
  const cleanSummary = apply(summary.trim());
  const cleanPointers = pointers.map((p) =>
    p.note === undefined ? p : { ...p, note: apply(p.note) },
  );

  return {
    ok: true,
    draft: {
      kind: 'area',
      key: input.plan.key,
      title: cleanTitle,
      summary: cleanSummary,
      keywords,
      pointers: cleanPointers,
      period: null,
      // 계획이 이름만 넘긴 파일이 있거나, 계획엔 있었지만 실제로 못 읽은 파일이 있으면 요약이 불완전하다.
      summaryOnly:
        input.plan.summaryOnly ||
        input.contents.length < input.plan.files.filter((f) => f.include).length,
      modelId: adapter.id,
      usage: generated.usage,
      costUsd: generated.costUsd,
      filtered: input.redactConfig !== null,
      redacted,
    },
  };
}

/** 테스트·CLI 미리보기용 — 모델에 실제로 보내는 프롬프트. */
export { buildPrompt as buildAreaPrompt, SYSTEM_PROMPT as AREA_SYSTEM_PROMPT };
