// 자동 연결 상한 — decisions/evidence-collection.md "주제 ↔ 분석 글 연결"(BE7). 한 곳.
export const AUTO_LINK_LIMITS = {
  /** 주제 하나에 붙이는 auto 연결 최대 수(점수 순). 큐 행 "근거 n건"이 수십 건이 되지 않게. */
  maxPerTopic: 12,
  /** 틱 하나가 다시 계산하는 주제 수 — 틱 사이에 Run·IndexJob이 끼어들 수 있게 작게. */
  topicsPerTick: 20,
  /** 연 단위 기간(`2024`)이 펼쳐지는 달 수 상한(12) — 범위가 이보다 길면 잘라서 앞부터. */
  maxMonths: 36,
} as const;

/** 테스트·CLI가 상한을 바꿔 넘길 수 있는 형태(값은 숫자). */
export type AutoLinkLimits = { readonly [K in keyof typeof AUTO_LINK_LIMITS]: number };
