// 근거 수집 상한 — decisions/evidence-collection.md "근거 수집"(BE8). 한 곳.
export const EVIDENCE_LIMITS = {
  /** 조각 하나 최대 줄 수. 라인 범위가 없는 포인터(파일 전체)는 앞에서 이만큼만. */
  snippetLines: 200,
  /** 조각 하나 최대 바이트(UTF-8). 넘으면 잘라내고 `truncated`. */
  snippetBytes: 16 * 1024,
  /** linked 항목 최대 수 — manual 연결 → auto 연결 순, 글의 포인터 순으로 앞에서부터. */
  maxLinked: 40,
} as const;
export type EvidenceLimits = { readonly [K in keyof typeof EVIDENCE_LIMITS]: number };
