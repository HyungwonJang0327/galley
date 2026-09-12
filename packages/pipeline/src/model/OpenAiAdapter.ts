import OpenAI from 'openai';
import type { GenerateInput, GenerateResult, ModelAdapter, ModelPricing } from './ModelAdapter.ts';
import { calculateCostUsd } from './cost.ts';

/** 어댑터가 쓰는 SDK 표면만(Responses API). 테스트는 가짜를 주입한다. */
export interface OpenAiResponsesClient {
  responses: {
    create(
      params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
    ): Promise<OpenAI.Responses.Response>;
  };
}

export interface OpenAiAdapterOptions {
  /** API 모델 id(예 `gpt-5.1`). 어댑터 id는 `openai:<model>`. */
  model: string;
  label: string;
  pricing: ModelPricing;
  /** `.env` OPENAI_API_KEY. 없으면 `available:false`. */
  apiKey: string | undefined;
  client?: OpenAiResponsesClient;
}

/** 비스트리밍 요청 기본 상한(Claude 어댑터와 동일). */
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

function findRefusal(output: OpenAI.Responses.Response['output']): string | undefined {
  for (const item of output) {
    if (item.type !== 'message') continue;
    for (const part of item.content) {
      if (part.type === 'refusal') return part.refusal;
    }
  }
  return undefined;
}

export function createOpenAiAdapter(options: OpenAiAdapterOptions): ModelAdapter {
  const { model, label, pricing, apiKey } = options;
  const available = apiKey !== undefined && apiKey !== '';
  let client = options.client;

  return {
    id: `openai:${model}`,
    label,
    provider: 'openai',
    pricing,
    available,
    async generate(input: GenerateInput): Promise<GenerateResult> {
      if (!available) {
        throw new Error(`API 키 없음 (.env OPENAI_API_KEY) — ${label}`);
      }
      client ??= new OpenAI({ apiKey });

      const startedAt = performance.now();
      const response = await client.responses.create({
        model,
        input: input.prompt,
        max_output_tokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ...(input.system !== undefined ? { instructions: input.system } : {}),
      });
      const durationMs = Math.round(performance.now() - startedAt);

      if (response.error) {
        throw new Error(`모델 응답 오류 (${response.error.code}): ${response.error.message}`);
      }
      const refusal = findRefusal(response.output);
      if (refusal !== undefined) {
        throw new Error(`모델이 응답을 거부했습니다 (refusal) ${refusal}`.trimEnd());
      }
      if (!response.usage) {
        throw new Error(`모델 응답에 usage가 없습니다 — ${label}`);
      }

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };

      return {
        text: response.output_text,
        usage,
        costUsd: calculateCostUsd(usage, pricing),
        durationMs,
      };
    },
  };
}
