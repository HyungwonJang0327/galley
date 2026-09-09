import type { GenerateInput, GenerateResult, ModelAdapter } from './ModelAdapter';

export interface MockAdapterOptions {
  /** generate가 항상 돌려줄 고정 텍스트. */
  text?: string;
}

const DEFAULT_TEXT = '(mock) 고정 응답 텍스트입니다.';

/** 문자 4개 ≈ 토큰 1개로 어림한다(실제 토크나이저 없음). 최소 1. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * 테스트·데모용 Mock 어댑터. 고정 텍스트를 돌려주고 비용은 항상 0.
 * 프로덕션 레지스트리에는 development에서만 노출한다(BM2, decisions/model-selection.md).
 */
export function createMockAdapter(options: MockAdapterOptions = {}): ModelAdapter {
  const text = options.text ?? DEFAULT_TEXT;

  return {
    id: 'mock',
    label: 'Mock',
    provider: 'mock',
    pricing: { inputPerMTok: 0, outputPerMTok: 0 },
    available: true,
    generate(input: GenerateInput): Promise<GenerateResult> {
      const startedAt = performance.now();
      const inputText = input.system ? `${input.system}\n${input.prompt}` : input.prompt;
      return Promise.resolve({
        text,
        usage: {
          inputTokens: estimateTokens(inputText),
          outputTokens: estimateTokens(text),
        },
        costUsd: 0,
        durationMs: Math.round(performance.now() - startedAt),
      });
    },
  };
}
