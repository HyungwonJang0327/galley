import { describe, test, expect } from 'vitest';
import type OpenAI from 'openai';
import { createOpenAiAdapter } from './OpenAiAdapter.ts';
import type { OpenAiResponsesClient } from './OpenAiAdapter.ts';

const PRICING = { inputPerMTok: 1.25, outputPerMTok: 10 };

function fakeResponse(
  overrides: Partial<OpenAI.Responses.Response> = {},
): OpenAI.Responses.Response {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    model: 'gpt-5.1',
    output_text: '응답',
    output: [],
    error: null,
    incomplete_details: null,
    usage: { input_tokens: 100, output_tokens: 40 } as OpenAI.Responses.ResponseUsage,
    ...overrides,
  } as OpenAI.Responses.Response;
}

/** create 호출 파라미터를 기록하고 고정 응답을 돌려주는 가짜 클라이언트. */
function fakeClient(response: OpenAI.Responses.Response) {
  const calls: OpenAI.Responses.ResponseCreateParamsNonStreaming[] = [];
  const client: OpenAiResponsesClient = {
    responses: {
      create: (params) => {
        calls.push(params);
        return Promise.resolve(response);
      },
    },
  };
  return { client, calls };
}

function adapterWith(response: OpenAI.Responses.Response) {
  const { client, calls } = fakeClient(response);
  const adapter = createOpenAiAdapter({
    model: 'gpt-5.1',
    label: 'GPT-5.1',
    pricing: PRICING,
    apiKey: 'sk-test',
    client,
  });
  return { adapter, calls };
}

describe('createOpenAiAdapter', () => {
  test('id는 openai:모델, provider openai, 단가는 그대로', () => {
    const { adapter } = adapterWith(fakeResponse());

    expect(adapter.id).toBe('openai:gpt-5.1');
    expect(adapter.label).toBe('GPT-5.1');
    expect(adapter.provider).toBe('openai');
    expect(adapter.pricing).toEqual(PRICING);
  });

  test('API 키가 없거나 빈 문자열이면 available:false', () => {
    const base = { model: 'gpt-5.1', label: 'GPT-5.1', pricing: PRICING };

    expect(createOpenAiAdapter({ ...base, apiKey: 'sk-test' }).available).toBe(true);
    expect(createOpenAiAdapter({ ...base, apiKey: undefined }).available).toBe(false);
    expect(createOpenAiAdapter({ ...base, apiKey: '' }).available).toBe(false);
  });

  test('generate는 model·instructions(system)·input(프롬프트)·max_output_tokens를 보낸다', async () => {
    const { adapter, calls } = adapterWith(fakeResponse());

    await adapter.generate({ prompt: '글을 써라', system: '어투 지침', maxOutputTokens: 321 });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: 'gpt-5.1',
      instructions: '어투 지침',
      input: '글을 써라',
      max_output_tokens: 321,
    });
  });

  test('output_text·usage·비용(단가표)·durationMs를 채운다', async () => {
    const { adapter } = adapterWith(
      fakeResponse({
        output_text: '본문',
        usage: {
          input_tokens: 1_000_000,
          output_tokens: 100_000,
        } as OpenAI.Responses.ResponseUsage,
      }),
    );

    const result = await adapter.generate({ prompt: 'p' });

    expect(result.text).toBe('본문');
    expect(result.usage).toEqual({ inputTokens: 1_000_000, outputTokens: 100_000 });
    expect(result.costUsd).toBe(1.25 + 1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('응답에 error가 있으면 메시지를 담아 던진다', async () => {
    const { adapter } = adapterWith(
      fakeResponse({
        status: 'failed',
        error: { code: 'server_error', message: '서버 오류' },
      }),
    );

    await expect(adapter.generate({ prompt: 'p' })).rejects.toThrow('서버 오류');
  });

  test('출력에 refusal 파트가 있으면 던진다', async () => {
    const { adapter } = adapterWith(
      fakeResponse({
        output_text: '',
        output: [
          {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: '거부' }],
          },
        ],
      }),
    );

    await expect(adapter.generate({ prompt: 'p' })).rejects.toThrow(/refusal/);
  });

  test('available:false면 클라이언트를 부르지 않고 키 이름을 담아 던진다', async () => {
    const { client, calls } = fakeClient(fakeResponse());
    const adapter = createOpenAiAdapter({
      model: 'gpt-5.1',
      label: 'GPT-5.1',
      pricing: PRICING,
      apiKey: undefined,
      client,
    });

    await expect(adapter.generate({ prompt: 'p' })).rejects.toThrow('OPENAI_API_KEY');
    expect(calls).toHaveLength(0);
  });
});
