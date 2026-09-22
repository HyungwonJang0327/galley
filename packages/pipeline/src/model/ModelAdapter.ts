export type ModelProvider = 'anthropic' | 'openai' | 'mock';
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateInput {
  prompt: string;
  system?: string;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  text: string;
  usage: ModelUsage;
  costUsd: number;
  /** 출력이 maxOutputTokens에 걸려 잘렸는가(Anthropic stop_reason max_tokens · OpenAI status incomplete). 단계가 실패로 다룬다. */
  truncated: boolean;
  durationMs: number;
}

export interface ModelAdapter {
  readonly id: string;
  readonly label: string;
  readonly provider: ModelProvider;
  readonly pricing: ModelPricing;
  readonly available: boolean;
  generate(input: GenerateInput): Promise<GenerateResult>;
}
