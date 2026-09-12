import Anthropic from '@anthropic-ai/sdk';
import type { GenerateInput, GenerateResult, ModelAdapter, ModelPricing } from './ModelAdapter.ts';
import { calculateCostUsd } from './cost.ts';

/** 어댑터가 쓰는 SDK 표면만. 테스트는 가짜를 주입한다. */
export interface AnthropicMessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface AnthropicAdapterOptions {
  /** API 모델 id(예 `claude-opus-5`). 어댑터 id는 `anthropic:<model>`. */
  model: string;
  label: string;
  pricing: ModelPricing;
  /** `.env` ANTHROPIC_API_KEY. 없으면 `available:false`. */
  apiKey: string | undefined;
  client?: AnthropicMessagesClient;
}

/** 비스트리밍 요청 기본 상한(스트리밍은 Phase 1에 없음 — decisions/model-selection.md). */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

export function createAnthropicAdapter(options: AnthropicAdapterOptions): ModelAdapter {
  const { model, label, pricing, apiKey } = options;
  const available = apiKey !== undefined && apiKey !== '';
  let client = options.client;

  return {
    id: `anthropic:${model}`,
    label,
    provider: 'anthropic',
    pricing,
    available,
    async generate(input: GenerateInput): Promise<GenerateResult> {
      if (!available) {
        throw new Error(`API 키 없음 (.env ANTHROPIC_API_KEY) — ${label}`);
      }
      client ??= new Anthropic({ apiKey });

      const startedAt = performance.now();
      const response = await client.messages.create({
        model,
        max_tokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ...(input.system !== undefined ? { system: input.system } : {}),
        messages: [{ role: 'user', content: input.prompt }],
      });
      const durationMs = Math.round(performance.now() - startedAt);

      if (response.stop_reason === 'refusal') {
        const detail = response.stop_details?.explanation ?? response.stop_details?.category ?? '';
        throw new Error(`모델이 응답을 거부했습니다 (stop_reason refusal) ${detail}`.trimEnd());
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

      return { text, usage, costUsd: calculateCostUsd(usage, pricing), durationMs };
    },
  };
}
