import { describe, test, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropicAdapter } from './AnthropicAdapter';
import type { AnthropicMessagesClient } from './AnthropicAdapter';

const PRICING = { inputPerMTok: 5, outputPerMTok: 25 };

function fakeMessage(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text: '응답', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 40 },
    ...overrides,
  } as Anthropic.Message;
}

/** create 호출 파라미터를 기록하고 고정 응답을 돌려주는 가짜 클라이언트. */
function fakeClient(message: Anthropic.Message) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: AnthropicMessagesClient = {
    messages: {
      create: (params) => {
        calls.push(params);
        return Promise.resolve(message);
      },
    },
  };
  return { client, calls };
}

function adapterWith(message: Anthropic.Message) {
  const { client, calls } = fakeClient(message);
  const adapter = createAnthropicAdapter({
    model: 'claude-opus-5',
    label: 'Claude Opus 5',
    pricing: PRICING,
    apiKey: 'sk-test',
    client,
  });
  return { adapter, calls };
}

describe('createAnthropicAdapter', () => {
  test('id는 anthropic:모델, provider anthropic, 단가는 그대로', () => {
    const { adapter } = adapterWith(fakeMessage());

    expect(adapter.id).toBe('anthropic:claude-opus-5');
    expect(adapter.label).toBe('Claude Opus 5');
    expect(adapter.provider).toBe('anthropic');
    expect(adapter.pricing).toEqual(PRICING);
  });

  test('API 키가 없거나 빈 문자열이면 available:false', () => {
    const base = { model: 'claude-opus-5', label: 'Claude Opus 5', pricing: PRICING };

    expect(createAnthropicAdapter({ ...base, apiKey: 'sk-test' }).available).toBe(true);
    expect(createAnthropicAdapter({ ...base, apiKey: undefined }).available).toBe(false);
    expect(createAnthropicAdapter({ ...base, apiKey: '' }).available).toBe(false);
  });

  test('generate는 model·system·프롬프트를 user 메시지로 보내고 max_tokens 기본값을 채운다', async () => {
    const { adapter, calls } = adapterWith(fakeMessage());

    await adapter.generate({ prompt: '글을 써라', system: '어투 지침' });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      model: 'claude-opus-5',
      system: '어투 지침',
      messages: [{ role: 'user', content: '글을 써라' }],
    });
    expect(calls[0]?.max_tokens).toBeGreaterThan(0);
  });

  test('maxOutputTokens를 주면 max_tokens로 전달된다', async () => {
    const { adapter, calls } = adapterWith(fakeMessage());

    await adapter.generate({ prompt: 'p', maxOutputTokens: 321 });

    expect(calls[0]?.max_tokens).toBe(321);
  });

  test('text 블록을 이어 붙이고 usage·비용(단가표)·durationMs를 채운다', async () => {
    const { adapter } = adapterWith(
      fakeMessage({
        content: [
          { type: 'text', text: '앞', citations: null },
          { type: 'text', text: '뒤', citations: null },
        ],
        usage: { input_tokens: 1_000_000, output_tokens: 200_000 } as Anthropic.Usage,
      }),
    );

    const result = await adapter.generate({ prompt: 'p' });

    expect(result.text).toBe('앞뒤');
    expect(result.usage).toEqual({ inputTokens: 1_000_000, outputTokens: 200_000 });
    expect(result.costUsd).toBe(5 + 5);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('stop_reason이 refusal이면 던진다', async () => {
    const { adapter } = adapterWith(fakeMessage({ stop_reason: 'refusal', content: [] }));

    await expect(adapter.generate({ prompt: 'p' })).rejects.toThrow(/refusal/);
  });

  test('available:false면 클라이언트를 부르지 않고 키 이름을 담아 던진다', async () => {
    const { client, calls } = fakeClient(fakeMessage());
    const adapter = createAnthropicAdapter({
      model: 'claude-opus-5',
      label: 'Claude Opus 5',
      pricing: PRICING,
      apiKey: undefined,
      client,
    });

    await expect(adapter.generate({ prompt: 'p' })).rejects.toThrow('ANTHROPIC_API_KEY');
    expect(calls).toHaveLength(0);
  });
});
