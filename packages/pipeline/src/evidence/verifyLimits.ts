// 근거 검증 상한 — decisions/evidence-collection.md "근거 검증"(BE10). 한 곳.
export const VERIFY_LIMITS = {
  /** 모델에 판정을 맡기는 서술 문장 최대 수(앞에서부터). 넘는 문장은 `uncertain`(reason `not-judged`). */
  maxStatements: 40,
  /** 서술 문장으로 세는 최소·최대 글자 수(짧은 구호·긴 인용은 뺀다). */
  statementMinChars: 8,
  statementMaxChars: 300,
  /** 클린룸 검사: 근거 조각의 이만큼 이상 연속 줄이 본문에 그대로 있으면 flag. */
  cleanRoomLines: 3,
  /** 클린룸 검사에서 세는 줄의 최소 길이(공백 제외) — `}`·`)` 같은 줄은 무시. */
  cleanRoomMinLineChars: 8,
  /** 판정 JSON 출력 토큰 상한. */
  judgeMaxOutputTokens: 4_096,
} as const;
export type VerifyLimits = { readonly [K in keyof typeof VERIFY_LIMITS]: number };
