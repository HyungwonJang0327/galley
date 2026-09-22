// 리포 개요(overview) 분석 글 생성 — 이미 저장된 area·change 분석 글의 제목·요약·키워드를 입력으로 "이 리포는 무엇이고
// 어떻게 발전해 왔는가"를 한 편으로 받는다. 원본 파일은 읽지 않는다. 포인터는 모델이 근거로 고른 출처 글의 첫 포인터를
// 물려받는다(출처 포인터는 저장 시점에 검증됐으므로 전부 커밋에 실존). 저장 텍스트는 전부 redact.
import type { ModelAdapter, ModelUsage } from '../model/ModelAdapter.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import {
  cleanKeywords,
  cleanTitle,
  createRedactor,
  extractJson,
  isRecord,
  modelFailed,
  readTitleSummary,
  type AnalysisFailure,
} from './analysisText.ts';
import { INDEX_LIMITS, type IndexLimits } from './limits.ts';
import type { EvidencePointer } from './schema.ts';
import { compareCodepoint } from './tree.ts';

/** overview의 입력 한 건 — RepoAnalysis(area·change) 행에서 만든다. */
export interface OverviewSource {
  key: string;
  kind: 'area' | 'change';
  title: string;
  summary: string;
  keywords: string[];
  period: string | null;
  pointers: EvidencePointer[];
}

export interface OverviewAnalysisInput {
  repoName: string;
  sources: readonly OverviewSource[];
  redactConfig: RedactConfig | null;
  limits?: IndexLimits;
}

export interface OverviewAnalysisDraft {
  kind: 'overview';
  key: 'overview';
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

export type OverviewAnalysisResult = { ok: true; draft: OverviewAnalysisDraft } | AnalysisFailure;

export const OVERVIEW_KEY = 'overview';
/** 포인터 최대 개수(출처 글 하나당 하나). */
const MAX_POINTERS = 12;

const SYSTEM_PROMPT = `당신은 코드 리포지토리의 분석 글들을 종합해 기술 블로그 초안의 근거가 될 "리포 개요"를 쓰는 분석가입니다.
영역별(디렉터리) 분석 글과 기간별 변경 분석 글의 제목·요약을 읽고 아래 JSON 하나만 출력하세요(코드 펜스·설명 없이).
{
  "title": "이 리포가 무엇인지 한 줄로(한국어)",
  "summary": "무엇을 하는 시스템이고, 어떻게 구성되어 있으며, 어떤 흐름으로 발전해 왔는지 5~10문장(한국어). 회사·고객 식별 정보는 쓰지 마세요.",
  "keywords": ["소문자 영문 또는 한국어 키워드 8~15개 — 기술·패턴·도메인 개념"],
  "sources": ["개요의 근거가 된 분석 글 키 3~12개 — 목록의 key만"]
}`;

/** 상한 안에서 고른다 — area 전부(키 순) + change는 최근 기간부터. 자르면 summaryOnly. */
export function selectOverviewSources(
  sources: readonly OverviewSource[],
  limits: IndexLimits = INDEX_LIMITS,
): { selected: OverviewSource[]; truncated: boolean } {
  const areas = sources
    .filter((s) => s.kind === 'area')
    .sort((a, b) => compareCodepoint(a.key, b.key));
  const changes = sources
    .filter((s) => s.kind === 'change')
    .sort(
      (a, b) => compareCodepoint(b.period ?? '', a.period ?? '') || compareCodepoint(a.key, b.key),
    );
  const selected = [...areas, ...changes].slice(0, limits.overviewSources);
  return { selected, truncated: selected.length < sources.length };
}

function buildPrompt(
  input: OverviewAnalysisInput,
  selected: readonly OverviewSource[],
  truncated: boolean,
): string {
  const areas = selected.filter((s) => s.kind === 'area');
  const changes = [...selected.filter((s) => s.kind === 'change')].sort(
    (a, b) => compareCodepoint(a.period ?? '', b.period ?? '') || compareCodepoint(a.key, b.key),
  );
  const lines: string[] = [
    `리포지토리: ${input.repoName}`,
    `분석 글 ${selected.length}개 (영역 ${areas.length}, 변경 ${changes.length})${truncated ? ' — 입력 상한으로 일부만' : ''}`,
    '',
    '## 영역별 분석 글',
  ];
  for (const s of areas)
    lines.push(`### ${s.key} — ${s.title}`, s.summary, `키워드: ${s.keywords.join(', ')}`, '');
  lines.push('## 기간별 변경 분석 글 (오래된 순)');
  for (const s of changes)
    lines.push(`### ${s.key} — ${s.title}`, s.summary, `키워드: ${s.keywords.join(', ')}`, '');
  return lines.join('\n');
}

/**
 * 모델 호출 → JSON 검증 → 출처 키 해석(목록에 있는 key만) → 포인터 물려받기 → redact.
 * 유효한 출처가 없으면 area 글 전부(키 순)를 출처로 삼는다. 출처 글에 포인터가 하나도 없으면(비정상 데이터) 실패.
 */
export async function analyzeOverview(
  adapter: ModelAdapter,
  input: OverviewAnalysisInput,
): Promise<OverviewAnalysisResult> {
  const { selected, truncated } = selectOverviewSources(input.sources, input.limits);
  let generated;
  try {
    generated = await adapter.generate({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input, selected, truncated),
      maxOutputTokens: 3072,
    });
  } catch (error) {
    return modelFailed(error);
  }
  const invalid = (): AnalysisFailure => ({
    ok: false,
    code: 'MODEL_OUTPUT_INVALID',
    usage: generated.usage,
    costUsd: generated.costUsd,
  });
  const json = extractJson(generated.text);
  if (!isRecord(json)) return invalid();
  const head = readTitleSummary(json);
  if (head === undefined) return invalid();

  const byKey = new Map(selected.map((s) => [s.key, s] as const));
  const rawSources = Array.isArray(json['sources']) ? json['sources'] : [];
  const picked: OverviewSource[] = [];
  const seen = new Set<string>();
  for (const k of rawSources) {
    if (typeof k !== 'string') continue;
    const source = byKey.get(k.trim());
    if (source === undefined || seen.has(source.key)) continue;
    seen.add(source.key);
    picked.push(source);
  }
  const fallback = picked.length > 0 ? picked : selected.filter((s) => s.kind === 'area');
  const pointers: EvidencePointer[] = [];
  for (const s of fallback) {
    const first = s.pointers[0];
    if (first === undefined) continue;
    pointers.push({
      commit: first.commit,
      path: first.path,
      ...(first.lineStart !== undefined ? { lineStart: first.lineStart } : {}),
      ...(first.lineEnd !== undefined ? { lineEnd: first.lineEnd } : {}),
      note: s.title,
    });
    if (pointers.length >= MAX_POINTERS) break;
  }
  if (pointers.length === 0) return invalid();

  const redactor = createRedactor(input.redactConfig);
  const keywords = cleanKeywords(json['keywords'], redactor);
  const title = cleanTitle(head.title, redactor);
  const summary = redactor.apply(head.summary);
  // note는 출처 글의 제목 — 이미 redact를 거쳐 저장된 값이지만 같은 설정으로 한 번 더 걸러도 해가 없다.
  const cleanPointers = pointers.map((p) =>
    p.note === undefined ? p : { ...p, note: redactor.apply(p.note) },
  );

  return {
    ok: true,
    draft: {
      kind: 'overview',
      key: OVERVIEW_KEY,
      title,
      summary,
      keywords,
      pointers: cleanPointers,
      period: null,
      summaryOnly: truncated,
      modelId: adapter.id,
      usage: generated.usage,
      costUsd: generated.costUsd,
      filtered: redactor.filtered,
      redacted: redactor.redacted,
    },
  };
}

/** 테스트·CLI 미리보기용 — 모델에 실제로 보내는 프롬프트. */
export function buildOverviewPrompt(input: OverviewAnalysisInput): string {
  const { selected, truncated } = selectOverviewSources(input.sources, input.limits);
  return buildPrompt(input, selected, truncated);
}
export { SYSTEM_PROMPT as OVERVIEW_SYSTEM_PROMPT };
