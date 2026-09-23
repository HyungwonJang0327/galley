// 모델을 쓰는 단계의 상한 — decisions/evidence-collection.md "벨로그 본문"(BS2). 한 곳.
export const WRITING_LIMITS = {
  /** 프롬프트에 넣는 근거 조각 총 글자 수. 넘는 항목은 포인터(경로·라인·note)만 넣고 조각은 뺀다. */
  evidenceChars: 120_000,
  /** 분석 글 요약 총 글자 수(넘으면 뒤의 것은 제목만). */
  summaryChars: 12_000,
  /** 본문 출력 토큰 상한(벨로그 2,000~3,000자 + 코드 2~4개면 충분). */
  velogMaxOutputTokens: 8_192,
  /** 링크드인 글 출력 토큰 상한. 한국어 1,300자는 최대 1,900 토큰 안팎이라 여유를 둔다(절단 상한이지 지출 상한이 아니다). 실모델 스모크(BS5 뒤)에서 확정. */
  linkedinMaxOutputTokens: 4_096,
  /** Zenn 일본어판 출력 토큰 상한. 본문 2,500~4,000자(일본어는 글자당 1토큰 안팎) + 벨로그판 코드 그대로. 절단 상한이라 비용과 무관. */
  zennMaxOutputTokens: 12_288,
} as const;
export type WritingLimits = { readonly [K in keyof typeof WRITING_LIMITS]: number };
