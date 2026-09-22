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
  /** 읽지 못한 포인터 수(커밋·경로가 사라짐 등). 실패가 아니라 기록이다. */
  unreadable: number;
  /** 식별 정보 필터를 거쳤는가(설정 없이 진행하면 false — readOnly 리포가 있으면 단계가 거부한다). */
  filtered: boolean;
}

/** posts 쪽 — snippet 키가 없다(타입으로 강제). */
export type EvidencePointerItem = EvidenceItemBase;
export interface EvidencePointers extends Omit<EvidenceBundle, 'items'> {
  items: EvidencePointerItem[];
}

/** 조각을 뗀 포인터 전용 사본 — posts/<슬러그>/evidence.json의 내용. */
export function stripSnippets(bundle: EvidenceBundle): EvidencePointers {
  return {
    ...bundle,
    items: bundle.items.map((item) => {
      const { snippet: _snippet, ...pointer } = item;
      void _snippet;
      return pointer;
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

export type ParseBundleResult =
  { ok: true; bundle: EvidenceBundle } | { ok: false; code: 'EVIDENCE_BUNDLE_INVALID' };

/** DATA_DIR 파일 → 번들. 형식이 깨졌으면 값으로 거부(뒤 단계가 잘못된 근거로 본문을 쓰지 않게). */
export function parseEvidenceBundle(json: unknown): ParseBundleResult {
  const invalid = { ok: false as const, code: 'EVIDENCE_BUNDLE_INVALID' as const };
  if (!isRecord(json) || json['version'] !== 1) return invalid;
  const { runId, topicId, topicSlug, collectedAt, items, unreadable, filtered, analyses } = json;
  if (
    typeof runId !== 'string' ||
    typeof topicId !== 'string' ||
    typeof topicSlug !== 'string' ||
    typeof collectedAt !== 'string' ||
    !Array.isArray(items) ||
    !items.every(isItem) ||
    !Number.isInteger(unreadable) ||
    typeof filtered !== 'boolean' ||
    (analyses !== undefined && !(Array.isArray(analyses) && analyses.every(isAnalysis)))
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
    },
  };
}
