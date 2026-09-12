import type { ModelPricing, ModelUsage } from './ModelAdapter.ts';

const TOKENS_PER_MTOK = 1_000_000;

/** usage × 백만 토큰당 단가(USD). 어댑터 안에서 호출한다 — decisions/model-selection.md. */
export function calculateCostUsd(usage: ModelUsage, pricing: ModelPricing): number {
  return (
    (usage.inputTokens * pricing.inputPerMTok + usage.outputTokens * pricing.outputPerMTok) /
    TOKENS_PER_MTOK
  );
}
