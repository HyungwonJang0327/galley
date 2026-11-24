// EvidenceBundle — 근거 수집 단계의 산출물(decisions/evidence-collection.md "데이터 모델"). **파일 2곳**:
// snippet 포함 원본은 `<DATA_DIR>/evidence/<슬러그>/<runId>.json`(EvidenceStore), `posts/<슬러그>/evidence.json`은 포인터만
// (`stripSnippets` 결과를 B3a가 쓴다). 회사 코드 조각은 DATA_DIR 밖으로 나가지 않는다(CLAUDE.md §5).
export type EvidenceSource = 'linked' | 'discovered';

export interface EvidenceItemBase {
  /** 어느 분석 글에서 왔는가(discovered는 인덱스 탐색 결과라 있을 수 있고, 수동 포인터면 없다). */
  analysisId?: string;
  commit: string;
  path: string;
  /** 읽은 줄 범위(1부터, 포함). 라인 없는 포인터는 파일 앞 `snippetLines`줄. */
  lineRange: { start: number; end: number };
  /** 그 커밋의 작성일(ISO 8601). 발행정보 `## 근거` 목록에 쓴다. */
  date: string;
  /** 분석 글 포인터의 note(redact 거침). */
  note?: string;
  source: EvidenceSource;
  /** 조각·note에 식별 정보 치환이 있었는가. */
  redacted: boolean;
  /** 상한(줄·바이트)으로 잘렸는가. */
  truncated: boolean;
}

/** DATA_DIR 쪽 — 실제 코드 조각을 담는다. */
export interface EvidenceItem extends EvidenceItemBase {
  snippet: string;
}

/** 항목이 온 분석 글의 요약 — 본문 단계 입력의 "요약"(decisions 2026-09-22 BE8 ⑨). 인덱싱 때 이미 redact된 값. */
export interface EvidenceAnalysis {
  id: string;
  kind: 'overview' | 'area' | 'change';
  title: string;
  summary: string;
}

/**
 * 커밋 이력 한 줄의 포인터 쪽 — posts 사본에 남는 것은 이것뿐이다(커밋·날짜·경로). 제목·본문은 회사 글이라 DATA_DIR에만.
 */
export interface EvidenceCommitPointer {
  commit: string;
  /** 작성일(ISO 8601). */
  date: string;
  /** 번들 조각의 경로 중 이 커밋이 건드린 것 — 이 커밋이 이력에 든 이유. */
  paths: string[];
}

export interface EvidenceCommitFile {
  /** A 추가 · M 수정 · D 삭제 · T 종류 변경. */
  status: 'A' | 'M' | 'D' | 'T';
  path: string;
  /** 추가·삭제 줄 수(바이너리는 없다). */
  added?: number;
  deleted?: number;
}

/** DATA_DIR 쪽 — 커밋 메시지(제목·본문, redact 거침)와 그 커밋이 바꾼 파일·줄 수. diff 본문은 없다. */
export interface EvidenceCommit extends EvidenceCommitPointer {
  /** 어느 리포의 커밋인가(리포 이름). */
  repo: string;
  subject: string;
  body: string;
  /** 바꾼 파일(상한 `historyFilesPerCommit`까지). */
  files: EvidenceCommitFile[];
  /** 그 커밋이 바꾼 파일 전체 수(`files`가 잘렸어도 이 수는 전체). */
  fileCount: number;
  redacted: boolean;
  /** 본문·파일 목록이 상한으로 잘렸는가. */
  truncated: boolean;
}

export type EvidenceDocKind = 'worklog' | 'decisions';

/** 작업 문서 절의 포인터 쪽 — posts 사본에 남는 것(어느 문서의 몇 줄인가). 제목·본문은 DATA_DIR에만. */
export interface EvidenceDocPointer {
  kind: EvidenceDocKind;
  /** `worklog/2026-06-20.md` — 문서 폴더 기준 상대 경로(절대경로 없음). */
  path: string;
  lineRange: { start: number; end: number };
  /** git = 리포의 HEAD 커밋에서, disk = 리포 바로 위 폴더에서(커밋 없음). */
  source: 'git' | 'disk';
  commit?: string;
  /** 파일 이름의 날짜(`YYYY-MM-DD`) — worklog. */
  date?: string;
}

/** DATA_DIR 쪽 — 절의 머리글 경로와 본문(redact 거침). */
export interface EvidenceDoc extends EvidenceDocPointer {
  repo: string;
  title: string;
  text: string;
  redacted: boolean;
  truncated: boolean;
}

export interface EvidenceBundle {
  version: 1;
  runId: string;
  topicId: string;
  topicSlug: string;
  /** 번들을 만든 시각(ISO). */
  collectedAt: string;
  items: EvidenceItem[];
  /** 항목이 온 분석 글의 제목·요약(옵션 — 없으면 빈 배열로 읽는다, version 1 유지). */
  analyses?: EvidenceAnalysis[];
  /**
   * 조각의 파일들을 건드린 커밋 이력, **오래된 순**(옵션 — 없으면 빈 배열로 읽는다, version 1 유지).
   * decisions/evidence-collection.md "근거의 층과 순서".
   */
  history?: EvidenceCommit[];
  /** 상한(`maxHistoryCommits`)에 밀려 이력에서 빠진 커밋 수. */
  historyOmitted?: number;
  /** 주제와 관련된 작업 문서(worklog·decisions)의 절 — worklog(날짜순) → decisions(옵션, 없으면 빈 배열). */
  docs?: EvidenceDoc[];
  /** 관련은 있으나 종류별 상한에 밀린 절 수. */
  docsOmitted?: number;
  /** 읽지 못한 포인터 수(커밋·경로가 사라짐 등). 실패가 아니라 기록이다. */
  unreadable: number;
  /** 식별 정보 필터를 거쳤는가(설정 없이 진행하면 false — readOnly 리포가 있으면 단계가 거부한다). */
  filtered: boolean;
}

/** posts 쪽 — snippet 키가 없다(타입으로 강제). */
export type EvidencePointerItem = EvidenceItemBase;
export interface EvidencePointers extends Omit<EvidenceBundle, 'items' | 'history' | 'docs'> {
  items: EvidencePointerItem[];
  history?: EvidenceCommitPointer[];
  docs?: EvidenceDocPointer[];
}

/** 조각을 뗀 포인터 전용 사본 — posts/<슬러그>/evidence.json의 내용. */
export function stripSnippets(bundle: EvidenceBundle): EvidencePointers {
  const { history, docs, ...rest } = bundle;
  return {
    ...rest,
    items: bundle.items.map((item) => {
      const { snippet: _snippet, ...pointer } = item;
      void _snippet;
      return pointer;
    }),
    // 커밋 메시지·파일별 줄 수는 떼고 포인터(커밋·날짜·경로)만 — 이름을 골라 옮긴다(나중에 필드가 늘어도 새지 않게).
    ...(history === undefined
      ? {}
      : { history: history.map((c) => ({ commit: c.commit, date: c.date, paths: c.paths })) }),
    ...(docs === undefined
      ? {}
      : {
          docs: docs.map((d) => ({
            kind: d.kind,
            path: d.path,
            lineRange: d.lineRange,
            source: d.source,
            ...(d.commit !== undefined ? { commit: d.commit } : {}),
            ...(d.date !== undefined ? { date: d.date } : {}),
          })),
        }),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isLineRange = (v: unknown): v is { start: number; end: number } =>
  isRecord(v) &&
  Number.isInteger(v['start']) &&
  Number.isInteger(v['end']) &&
  (v['start'] as number) >= 1 &&
  (v['end'] as number) >= (v['start'] as number);

function isItem(v: unknown): v is EvidenceItem {
  if (!isRecord(v)) return false;
  return (
    typeof v['commit'] === 'string' &&
    typeof v['path'] === 'string' &&
    isLineRange(v['lineRange']) &&
    typeof v['date'] === 'string' &&
    (v['source'] === 'linked' || v['source'] === 'discovered') &&
    typeof v['redacted'] === 'boolean' &&
    typeof v['truncated'] === 'boolean' &&
    typeof v['snippet'] === 'string' &&
    (v['analysisId'] === undefined || typeof v['analysisId'] === 'string') &&
    (v['note'] === undefined || typeof v['note'] === 'string')
  );
}

const isAnalysis = (v: unknown): v is EvidenceAnalysis =>
  isRecord(v) &&
  typeof v['id'] === 'string' &&
  (v['kind'] === 'overview' || v['kind'] === 'area' || v['kind'] === 'change') &&
  typeof v['title'] === 'string' &&
  typeof v['summary'] === 'string';

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

const isCommitFile = (v: unknown): v is EvidenceCommitFile =>
  isRecord(v) &&
  (v['status'] === 'A' || v['status'] === 'M' || v['status'] === 'D' || v['status'] === 'T') &&
  typeof v['path'] === 'string' &&
  (v['added'] === undefined || isCount(v['added'])) &&
  (v['deleted'] === undefined || isCount(v['deleted']));

/** 제목이 없는 것(= posts의 포인터 사본)은 거부한다 — 조각 없는 항목을 거부하는 것과 같은 이유. */
const isCommit = (v: unknown): v is EvidenceCommit =>
  isRecord(v) &&
  typeof v['commit'] === 'string' &&
  typeof v['date'] === 'string' &&
  isStringArray(v['paths']) &&
  typeof v['repo'] === 'string' &&
  typeof v['subject'] === 'string' &&
  typeof v['body'] === 'string' &&
  Array.isArray(v['files']) &&
  v['files'].every(isCommitFile) &&
  isCount(v['fileCount']) &&
  typeof v['redacted'] === 'boolean' &&
  typeof v['truncated'] === 'boolean';

/** 본문이 없는 것(= posts의 포인터 사본)은 거부한다. */
const isDoc = (v: unknown): v is EvidenceDoc =>
  isRecord(v) &&
  (v['kind'] === 'worklog' || v['kind'] === 'decisions') &&
  typeof v['path'] === 'string' &&
  isLineRange(v['lineRange']) &&
  (v['source'] === 'git' || v['source'] === 'disk') &&
  (v['commit'] === undefined || typeof v['commit'] === 'string') &&
  (v['date'] === undefined || typeof v['date'] === 'string') &&
  typeof v['repo'] === 'string' &&
  typeof v['title'] === 'string' &&
  typeof v['text'] === 'string' &&
  typeof v['redacted'] === 'boolean' &&
  typeof v['truncated'] === 'boolean';

export type ParseBundleResult =
  { ok: true; bundle: EvidenceBundle } | { ok: false; code: 'EVIDENCE_BUNDLE_INVALID' };

/** DATA_DIR 파일 → 번들. 형식이 깨졌으면 값으로 거부(뒤 단계가 잘못된 근거로 본문을 쓰지 않게). */
export function parseEvidenceBundle(json: unknown): ParseBundleResult {
  const invalid = { ok: false as const, code: 'EVIDENCE_BUNDLE_INVALID' as const };
  if (!isRecord(json) || json['version'] !== 1) return invalid;
  const { runId, topicId, topicSlug, collectedAt, items, unreadable, filtered, analyses } = json;
  const { history, historyOmitted, docs, docsOmitted } = json;
  if (
    typeof runId !== 'string' ||
    typeof topicId !== 'string' ||
    typeof topicSlug !== 'string' ||
    typeof collectedAt !== 'string' ||
    !Array.isArray(items) ||
    !items.every(isItem) ||
    !Number.isInteger(unreadable) ||
    typeof filtered !== 'boolean' ||
    (analyses !== undefined && !(Array.isArray(analyses) && analyses.every(isAnalysis))) ||
    (history !== undefined && !(Array.isArray(history) && history.every(isCommit))) ||
    (historyOmitted !== undefined && !isCount(historyOmitted)) ||
    (docs !== undefined && !(Array.isArray(docs) && docs.every(isDoc))) ||
    (docsOmitted !== undefined && !isCount(docsOmitted))
  )
    return invalid;
  return {
    ok: true,
    bundle: {
      version: 1,
      runId,
      topicId,
      topicSlug,
      collectedAt,
      items,
      unreadable: unreadable as number,
      filtered,
      analyses: analyses === undefined ? [] : (analyses as EvidenceAnalysis[]),
      history: history === undefined ? [] : (history as EvidenceCommit[]),
      historyOmitted: historyOmitted === undefined ? 0 : historyOmitted,
      docs: docs === undefined ? [] : (docs as EvidenceDoc[]),
      docsOmitted: docsOmitted === undefined ? 0 : docsOmitted,
    },
  };
}
