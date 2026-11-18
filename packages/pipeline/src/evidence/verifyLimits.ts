// 근거 검증 상한 — decisions/evidence-collection.md "근거 검증"(BE10). 한 곳.
export const VERIFY_LIMITS = {
  /**
   * 모델에 판정을 맡기는 서술 문장 최대 수(앞에서부터). 넘는 문장은 `uncertain`(reason `not-judged`).
   * 묶음(`judgeBatchSize`)으로 나눠 여러 번 부르므로 출력 상한과 무관하다 — 비용 상한이다(묶음마다 근거 묶음을 다시 보낸다).
   * 리허설 2026-11-16: 4,000자 글이 서술 100개 안팎(RH1).
   */
  maxStatements: 120,
  /**
   * 판정 한 번에 보내는 서술 문장 수. 한 묶음의 JSON 출력(문장당 id·status·사유 ≈ 60~150 토큰)이 `judgeMaxOutputTokens`에
   * 넉넉히 들어가게 잡는다 — 40문장 한 번에 보내던 때 Opus 5가 4,096에서 잘려 판정 전부를 잃었다(RH1).
   */
  judgeBatchSize: 20,
  /** 서술 문장으로 세는 최소·최대 글자 수(짧은 구호·긴 인용은 뺀다). */
  statementMinChars: 8,
  statementMaxChars: 300,
  /** 클린룸 검사: 근거 조각의 이만큼 이상 연속 줄이 본문에 그대로 있으면 flag. */
  cleanRoomLines: 3,
  /** 클린룸 검사에서 세는 줄의 최소 길이(공백 제외) — `}`·`)` 같은 줄은 무시. */
  cleanRoomMinLineChars: 8,
  /** 판정 JSON 출력 토큰 상한 — **묶음 하나** 기준. 잘리면 그 묶음만 uncertain(`judge-truncated`). */
  judgeMaxOutputTokens: 4_096,
} as const;
export type VerifyLimits = { readonly [K in keyof typeof VERIFY_LIMITS]: number };
