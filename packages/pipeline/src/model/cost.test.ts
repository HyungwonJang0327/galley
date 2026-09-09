import { describe, test, expect } from 'vitest';
import { calculateCostUsd } from './cost';

describe('calculateCostUsd', () => {
  test('입력·출력 토큰에 백만 토큰당 단가를 곱해 합산한다', () => {
    const cost = calculateCostUsd(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPerMTok: 5, outputPerMTok: 25 },
    );
    expect(cost).toBe(5 + 12.5);
  });

  test('작은 토큰 수도 소수로 정확히 계산한다', () => {
    const cost = calculateCostUsd(
      { inputTokens: 1_234, outputTokens: 567 },
      { inputPerMTok: 1, outputPerMTok: 5 },
    );
    expect(cost).toBeCloseTo(0.001234 + 0.002835, 9);
  });

  test('단가 0이면 비용 0이다', () => {
    expect(
      calculateCostUsd(
        { inputTokens: 10, outputTokens: 10 },
        { inputPerMTok: 0, outputPerMTok: 0 },
      ),
    ).toBe(0);
  });
});
