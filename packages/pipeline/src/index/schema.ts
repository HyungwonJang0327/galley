// 리포 인덱스 스키마의 어휘와 JSON 컬럼 헬퍼 — decisions/evidence-collection.md "데이터 모델".
// SQLite에는 enum도 배열도 없어 문자열 컬럼 + 애플리케이션 검증으로 표현한다. 값은 영어, 화면 라벨은 앱이 붙인다.
// DB를 모르는 순수 모듈이다. Prisma 호출은 인덱서·쿼리 모듈이 한다.

/** Repo.status — indexing(첫 인덱스 진행) | ready | stale(HEAD가 바뀜) | error(마지막 IndexJob이 failed). */
export const REPO_STATUS = {
  indexing: 'indexing',
  ready: 'ready',
  stale: 'stale',
  error: 'error',
} as const;
export type RepoStatus = (typeof REPO_STATUS)[keyof typeof REPO_STATUS];

const valuesOf = (record: Record<string, string>): readonly string[] => Object.values(record);

/** DB에서 읽은 문자열을 좁힌다(Run 쪽 isStepStatus와 같은 역할). */
export function isRepoStatus(value: string): value is RepoStatus {
  return valuesOf(REPO_STATUS).includes(value);
}

/** RepoAnalysis.kind — overview(리포 전체) | area(디렉터리·기능 영역) | change(커밋 묶음·기간별 변경). */
export const ANALYSIS_KIND = {
  overview: 'overview',
  area: 'area',
  change: 'change',
} as const;
export type AnalysisKind = (typeof ANALYSIS_KIND)[keyof typeof ANALYSIS_KIND];
export function isAnalysisKind(value: string): value is AnalysisKind {
  return valuesOf(ANALYSIS_KIND).includes(value);
}

/** TopicAnalysisLink.source — auto(키워드·기간 매칭) | manual(사용자 편집). */
export const LINK_SOURCE = { auto: 'auto', manual: 'manual' } as const;
export type LinkSource = (typeof LINK_SOURCE)[keyof typeof LINK_SOURCE];
export function isLinkSource(value: string): value is LinkSource {
  return valuesOf(LINK_SOURCE).includes(value);
}

/** IndexJob.kind — full | incremental(fromSha..toSha 범위만). */
export const INDEX_JOB_KIND = { full: 'full', incremental: 'incremental' } as const;
export type IndexJobKind = (typeof INDEX_JOB_KIND)[keyof typeof INDEX_JOB_KIND];
export function isIndexJobKind(value: string): value is IndexJobKind {
  return valuesOf(INDEX_JOB_KIND).includes(value);
}

/** IndexJob.status — 워커 실행 상태. Run.workerState와 같은 감지(heartbeat 공백 → interrupted → 재개). */
export const INDEX_JOB_STATUS = {
  queued: 'queued',
  running: 'running',
  interrupted: 'interrupted',
  done: 'done',
  failed: 'failed',
} as const;
export type IndexJobStatus = (typeof INDEX_JOB_STATUS)[keyof typeof INDEX_JOB_STATUS];
export function isIndexJobStatus(value: string): value is IndexJobStatus {
  return valuesOf(INDEX_JOB_STATUS).includes(value);
}

/**
 * 분석 글이 가리키는 원본 조각. commit 기준이라 HEAD가 바뀌어도 `git show <commit>:<path>`로 같은 조각을 읽는다.
 * 라인 범위가 없으면 파일 전체. note는 redact를 거친 한 줄 설명.
 */
export interface EvidencePointer {
  commit: string;
  path: string;
  lineStart?: number;
  lineEnd?: number;
  note?: string;
}

/** JSON 문자열 컬럼(`["a","b"]`) → 문자열 배열. 깨진 값·배열 아님·비문자열 요소는 빈 배열로(캐시 컬럼이라 던지지 않는다). */
export function parseStringArray(text: string | null | undefined): string[] {
  if (text === null || text === undefined || text === '') return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** 문자열 배열 → JSON 컬럼 값. 공백을 다듬고 빈 항목·중복을 없앤다(순서 유지). */
export function serializeStringArray(values: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (v === '' || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return JSON.stringify(out);
}

export type PointersFailure =
  { ok: false; code: 'POINTERS_EMPTY' } | { ok: false; code: 'POINTER_INVALID'; index: number };
export type PointersResult = { ok: true; pointers: EvidencePointer[] } | PointersFailure;

const isPointer = (value: unknown): value is EvidencePointer => {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  if (typeof p['commit'] !== 'string' || p['commit'] === '') return false;
  if (typeof p['path'] !== 'string' || p['path'] === '') return false;
  for (const key of ['lineStart', 'lineEnd'] as const) {
    const n = p[key];
    if (n !== undefined && (typeof n !== 'number' || !Number.isInteger(n) || n < 1)) return false;
  }
  if (p['note'] !== undefined && typeof p['note'] !== 'string') return false;
  if (
    typeof p['lineStart'] === 'number' &&
    typeof p['lineEnd'] === 'number' &&
    p['lineStart'] > p['lineEnd']
  )
    return false;
  return true;
};

/**
 * 포인터 배열 검증 — 저장 전에 부른다. **포인터 없는 분석 글은 저장하지 않는다**(≥ 1).
 * 예상된 실패는 값으로(decisions/error-handling.md).
 */
export function validatePointers(pointers: readonly unknown[]): PointersResult {
  if (pointers.length === 0) return { ok: false, code: 'POINTERS_EMPTY' };
  const out: EvidencePointer[] = [];
  for (const [index, p] of pointers.entries()) {
    if (!isPointer(p)) return { ok: false, code: 'POINTER_INVALID', index };
    out.push(p);
  }
  return { ok: true, pointers: out };
}

/** JSON 컬럼 → 포인터 배열. 깨진 값은 빈 배열(저장 시점에 validatePointers를 거쳤으므로 정상 데이터는 항상 ≥ 1). */
export function parsePointers(text: string): EvidencePointer[] {
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    const result = validatePointers(value);
    return result.ok ? result.pointers : [];
  } catch {
    return [];
  }
}

export type SerializedPointers = { ok: true; text: string } | PointersFailure;

/**
 * 저장용 JSON 컬럼 값. 검증을 포함한다 — **빈 배열·잘못된 포인터는 여기서 거부**되므로 이 함수를 거치지 않고는
 * 포인터 없는 분석 글을 만들 수 없다(BE1 완료 조건). 저장 함수는 `ok`일 때만 `text`를 쓴다.
 */
export function serializePointers(pointers: readonly unknown[]): SerializedPointers {
  const result = validatePointers(pointers);
  return result.ok ? { ok: true, text: JSON.stringify(result.pointers) } : result;
}
