// 테스트 전용 어댑터 — 호출마다 스크립트된 응답을 돌려주고 받은 입력을 기록한다(Mock 어댑터는 고정 텍스트만).
import type { GenerateInput, GenerateResult, ModelAdapter } from '../ModelAdapter.ts';

export interface ScriptedAdapter extends ModelAdapter {
  calls: GenerateInput[];
}

export function createScriptedAdapter(
  respond: (input: GenerateInput, callIndex: number) => string | Promise<string>,
  id = 'mock:scripted',
): ScriptedAdapter {
  const calls: GenerateInput[] = [];
  return {
    id,
    label: 'Scripted',
    provider: 'mock',
    pricing: { inputPerMTok: 1, outputPerMTok: 5 },
    available: true,
    calls,
    async generate(input: GenerateInput): Promise<GenerateResult> {
      calls.push(input);
      const text = await respond(input, calls.length - 1);
      return {
        text,
        usage: {
          inputTokens: Math.ceil(input.prompt.length / 4),
          outputTokens: Math.ceil(text.length / 4),
        },
        costUsd: 0.001,
        durationMs: 1,
      };
    },
  };
}
