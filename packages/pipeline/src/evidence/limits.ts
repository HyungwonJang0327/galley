// 근거 수집 상한 — decisions/evidence-collection.md "근거 수집"(BE8·BE9). 한 곳.
export const EVIDENCE_LIMITS = {
  /** 조각 하나 최대 줄 수. 라인 범위가 없는 포인터(파일 전체)는 앞에서 이만큼만. */
  snippetLines: 200,
  /** 조각 하나 최대 바이트(UTF-8). 넘으면 잘라내고 `truncated`. */
  snippetBytes: 16 * 1024,
  /** linked 항목 최대 수 — manual 연결 → auto 연결 순, 글의 포인터 순으로 앞에서부터. */
  maxLinked: 40,
  /** discovered로 고르는 **분석 글** 최대 수(키워드 점수 순) — 결정 "상한 8개". */
  maxDiscovered: 8,
  /** discovered **항목**(조각) 최대 수 — 고른 글 순서대로 앞에서부터. linked(40)보다 작게: 사람이 고르지 않은 근거다. */
  maxDiscoveredItems: 16,
  /** 기간 근접 가중이 미치는 달 수 — 주제 기간에서 이 달 수 안의 change 글은 거리에 따라 점수를 덜 받고, 넘으면 0. */
  periodNearMonths: 2,
} as const;
export type EvidenceLimits = { readonly [K in keyof typeof EVIDENCE_LIMITS]: number };
