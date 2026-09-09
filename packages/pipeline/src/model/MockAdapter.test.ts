import { describe, test, expect } from 'vitest';
import { createMockAdapter } from './MockAdapter';
import type { ModelAdapter } from './ModelAdapter';

describe('createMockAdapter', () => {
  test('provider mock · 단가 0 · 항상 available인 어댑터를 만든다', () => {
    const adapter: ModelAdapter = createMockAdapter();

    expect(adapter.id).toBe('mock');
    expect(adapter.label).toBe('Mock');
    expect(adapter.provider).toBe('mock');
    expect(adapter.pricing).toEqual({ inputPerMTok: 0, outputPerMTok: 0 });
    expect(adapter.available).toBe(true);
  });

  test('generate는 입력과 무관하게 고정 텍스트를 돌려주고 비용은 0이다', async () => {
    const adapter = createMockAdapter({ text: '고정 응답' });

    const a = await adapter.generate({ prompt: '첫 번째 프롬프트' });
    const b = await adapter.generate({ prompt: '완전히 다른 프롬프트', system: '시스템' });

    expect(a.text).toBe('고정 응답');
    expect(b.text).toBe('고정 응답');
    expect(a.costUsd).toBe(0);
    expect(b.costUsd).toBe(0);
  });

  test('text를 주지 않으면 기본 고정 텍스트를 돌려준다', async () => {
    const adapter = createMockAdapter();

    const result = await adapter.generate({ prompt: '아무거나' });

    expect(result.text.length).toBeGreaterThan(0);
  });

  test('usage는 프롬프트(+system)와 응답 길이에서 계산된 양의 정수, durationMs는 0 이상이다', async () => {
    const adapter = createMockAdapter({ text: '응답' });

    const short = await adapter.generate({ prompt: '짧다' });
    const long = await adapter.generate({
      prompt: '훨씬 더 긴 프롬프트 문자열입니다. 토큰 수가 늘어나야 합니다.',
      system: '시스템 프롬프트도 입력에 포함된다',
    });

    expect(Number.isInteger(short.usage.inputTokens)).toBe(true);
    expect(short.usage.inputTokens).toBeGreaterThan(0);
    expect(long.usage.inputTokens).toBeGreaterThan(short.usage.inputTokens);
    expect(short.usage.outputTokens).toBe(long.usage.outputTokens);
    expect(short.usage.outputTokens).toBeGreaterThan(0);
    expect(short.durationMs).toBeGreaterThanOrEqual(0);
  });
});
