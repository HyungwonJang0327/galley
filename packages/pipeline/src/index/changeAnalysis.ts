// 변경 묶음(change) 분석 글 생성 — 한 기간(월, 필요하면 디렉터리)의 커밋 메시지·변경 파일 목록을 모델에 주고
// "이 기간에 무엇을·왜 바꿨는가"를 한국어 요약·키워드·포인터로 받아 검증한다. diff는 보내지 않는다(포인터가 커밋·경로를
// 가리키면 근거 수집 단계가 그때 `git show`로 조각을 읽는다). 저장 텍스트는 전부 redact. 포인터는 묶음 안 커밋의 실제 변경
// 파일만(삭제 파일은 부모 커밋 기준 — pointerCandidates), 라인 범위는 받지 않는다(본문을 읽지 않았으므로 검증 불가).
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
import { pointerCandidates, type ChangeBatch, type ChangeCommit } from './changes.ts';
import { INDEX_LIMITS, type IndexLimits } from './limits.ts';
import type { EvidencePointer } from './schema.ts';

export interface ChangeAnalysisInput {
  repoName: string;
  batch: ChangeBatch;
  redactConfig: RedactConfig | null;
  limits?: IndexLimits;
}

export interface ChangeAnalysisDraft {
  kind: 'change';
  key: string;
  title: string;
  summary: string;
  keywords: string[];
  pointers: EvidencePointer[];
  period: string;
  summaryOnly: boolean;
  modelId: string;
  usage: ModelUsage;
  costUsd: number;
  filtered: boolean;
  redacted: boolean;
}

export type ChangeAnalysisResult = { ok: true; draft: ChangeAnalysisDraft } | AnalysisFailure;

/** 포인터 최대 개수 — 프롬프트가 요구하는 1~6개를 넘어도 이 이상은 저장하지 않는다. */
const MAX_POINTERS = 8;

const SYSTEM_PROMPT = `당신은 코드 리포지토리의 커밋 이력을 읽고 기술 블로그 초안의 근거가 될 "분석 글"을 쓰는 분석가입니다.
주어진 기간의 커밋 메시지와 변경 파일 목록을 읽고 아래 JSON 하나만 출력하세요(코드 펜스·설명 없이).
{
  "title": "이 기간에 한 일을 한 줄로(한국어)",
  "summary": "무엇을·왜 바꿨고 어떤 흐름이었는지 3~6문장(한국어). 구체적 기능·파일·모듈 이름을 포함하되 회사·고객 식별 정보는 쓰지 마세요.",
  "keywords": ["소문자 영문 또는 한국어 키워드 5~12개 — 기술·패턴·도메인 개념"],
  "pointers": [{ "commit": "커밋 해시(앞 7자리 이상)", "path": "그 커밋이 바꾼 파일 경로", "note": "이 파일이 보여주는 것 한 줄" }]
}
pointers는 요약의 근거가 되는 커밋·파일 1~6개. commit과 path는 반드시 목록에 있는 것만 쓰세요. diff는 주어지지 않습니다.`;

const short = (sha: string): string => sha.slice(0, 7);
const day = (authoredAt: string): string => authoredAt.slice(0, 10);

function describeCommit(c: ChangeCommit, limits: IndexLimits): string[] {
  if (!c.detail) return [`- ${short(c.sha)} ${day(c.authoredAt)} ${c.subject}`];
  const shown = c.files.slice(0, limits.filesPerCommit);
  const more = c.files.length - shown.length;
  const files =
    shown.map((f) => `${f.status} ${f.path}`).join(' · ') + (more > 0 ? ` (외 ${more}개)` : '');
  return [
    `### ${short(c.sha)} ${day(c.authoredAt)} ${c.subject}`,
    ...(c.body !== '' ? [c.body] : []),
    `파일: ${files}`,
    '',
  ];
}

function buildPrompt(input: ChangeAnalysisInput): string {
  const { batch } = input;
  const limits = input.limits ?? INDEX_LIMITS;
  const detail = batch.commits.filter((c) => c.detail);
  const titleOnly = batch.commits.filter((c) => !c.detail);
  const lines: string[] = [
    `리포지토리: ${input.repoName}`,
    `기간: ${batch.period}${batch.dir !== undefined ? ` (디렉터리: ${batch.dir})` : ''}`,
    `커밋 ${batch.commits.length}개${titleOnly.length > 0 ? ` (상세 ${detail.length}개, 나머지는 제목만)` : ''}`,
    '',
    '## 커밋 (오래된 순)',
  ];
  for (const c of detail) lines.push(...describeCommit(c, limits));
  if (titleOnly.length > 0) {
    lines.push('## 제목만 (입력 상한 초과)');
    for (const c of titleOnly) lines.push(...describeCommit(c, limits));
  }
  return lines.join('\n');
}

/** 모델이 준 (commit 접두, path)를 묶음 안의 실제 포인터 후보로 해석한다. 삭제 파일이면 부모 커밋 기준 포인터가 나온다. */
function resolvePointer(
  batch: ChangeBatch,
  rawCommit: string,
  rawPath: string,
): EvidencePointer | undefined {
  const prefix = rawCommit.trim().toLowerCase();
  if (!/^[0-9a-f]{4,40}$/.test(prefix)) return undefined;
  const commit = batch.commits.find((c) => c.sha.startsWith(prefix));
  if (commit === undefined) return undefined;
  return pointerCandidates(commit).find((p) => p.path === rawPath);
}

/**
 * 모델 호출 → JSON 검증 → 포인터 해석 → redact.
 * 유효한 포인터가 없으면 상세 커밋(최신부터)마다 첫 변경 파일을 포인터로 삼는다 — 전부 커밋에 실존하는 경로다.
 */
export async function analyzeChange(
  adapter: ModelAdapter,
  input: ChangeAnalysisInput,
): Promise<ChangeAnalysisResult> {
  let generated;
  try {
    generated = await adapter.generate({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input),
      maxOutputTokens: 2048,
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

  const { batch } = input;
  const seen = new Set<string>();
  const pointers: EvidencePointer[] = [];
  const rawPointers = Array.isArray(json['pointers']) ? json['pointers'] : [];
  for (const p of rawPointers) {
    if (!isRecord(p) || typeof p['commit'] !== 'string' || typeof p['path'] !== 'string') continue;
    const resolved = resolvePointer(batch, p['commit'], p['path']);
    if (resolved === undefined) continue;
    const id = `${resolved.commit}:${resolved.path}`;
    if (seen.has(id)) continue;
    seen.add(id);
    pointers.push(
      typeof p['note'] === 'string' && p['note'].trim() !== ''
        ? { ...resolved, note: p['note'].trim() }
        : resolved,
    );
    if (pointers.length >= MAX_POINTERS) break;
  }
  if (pointers.length === 0) {
    // 커밋마다 하나 — 그 커밋에 살아 있는 파일(추가·수정)을 삭제 파일(부모 기준)보다 먼저.
    for (const c of [...batch.commits].reverse()) {
      if (!c.detail) continue;
      const candidates = pointerCandidates(c);
      const pick = candidates.find((p) => p.commit === c.sha) ?? candidates[0];
      if (pick === undefined || seen.has(`${pick.commit}:${pick.path}`)) continue;
      seen.add(`${pick.commit}:${pick.path}`);
      pointers.push(pick);
      if (pointers.length >= MAX_POINTERS) break;
    }
  }
  if (pointers.length === 0) return invalid();

  const redactor = createRedactor(input.redactConfig);
  const keywords = cleanKeywords(json['keywords'], redactor);
  const title = cleanTitle(head.title, redactor);
  const summary = redactor.apply(head.summary);
  const cleanPointers = pointers.map((p) =>
    p.note === undefined ? p : { ...p, note: redactor.apply(p.note) },
  );

  return {
    ok: true,
    draft: {
      kind: 'change',
      key: batch.key,
      title,
      summary,
      keywords,
      pointers: cleanPointers,
      period: batch.period,
      summaryOnly: batch.summaryOnly,
      modelId: adapter.id,
      usage: generated.usage,
      costUsd: generated.costUsd,
      filtered: redactor.filtered,
      redacted: redactor.redacted,
    },
  };
}

/** 테스트·CLI 미리보기용 — 모델에 실제로 보내는 프롬프트. */
export { buildPrompt as buildChangePrompt, SYSTEM_PROMPT as CHANGE_SYSTEM_PROMPT };
