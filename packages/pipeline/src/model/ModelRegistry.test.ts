import { describe, test, expect } from 'vitest';
import {
  createModelRegistry,
  createModelRegistryFromEnv,
  DEFAULT_MODEL_ID,
  INDEXING_DEFAULT_MODEL_ID,
} from './ModelRegistry';
import { createMockAdapter } from './MockAdapter';
import type { ModelAdapter } from './ModelAdapter';

/** 테스트용 스텁 어댑터(generate는 호출하지 않는다). */
function stub(id: string, provider: ModelAdapter['provider'] = 'anthropic'): ModelAdapter {
  return {
    id,
    label: id,
    provider,
    pricing: { inputPerMTok: 1, outputPerMTok: 2 },
    available: true,
    generate: () => Promise.reject(new Error('stub')),
  };
}

describe('createModelRegistry', () => {
  test('list는 등록 순서를 유지하고 get은 id로 찾는다', () => {
    const a = stub('anthropic:a');
    const b = stub('openai:b', 'openai');
    const registry = createModelRegistry({
      adapters: [a, b],
      defaultId: 'anthropic:a',
      indexingDefaultId: 'openai:b',
    });

    expect(registry.list().map((x) => x.id)).toEqual(['anthropic:a', 'openai:b']);
    expect(registry.get('openai:b')).toBe(b);
    expect(registry.get('없는-id')).toBeUndefined();
  });

  test('default·indexingDefault는 지정한 id의 어댑터를 돌려준다', () => {
    const a = stub('anthropic:a');
    const b = stub('anthropic:b');
    const registry = createModelRegistry({
      adapters: [a, b],
      defaultId: 'anthropic:a',
      indexingDefaultId: 'anthropic:b',
    });

    expect(registry.default()).toBe(a);
    expect(registry.indexingDefault()).toBe(b);
  });

  test('기본 id가 등록되지 않았으면 default 호출 시 id를 담아 던진다', () => {
    const registry = createModelRegistry({
      adapters: [stub('anthropic:a')],
      defaultId: 'anthropic:missing',
      indexingDefaultId: 'anthropic:a',
    });

    expect(() => registry.default()).toThrow('anthropic:missing');
  });

  test('id가 중복되면 생성 시 던진다', () => {
    expect(() =>
      createModelRegistry({
        adapters: [stub('anthropic:a'), stub('anthropic:a')],
        defaultId: 'anthropic:a',
        indexingDefaultId: 'anthropic:a',
      }),
    ).toThrow('anthropic:a');
  });
});

describe('createModelRegistryFromEnv', () => {
  test('development에서만 Mock 어댑터가 목록에 있다', () => {
    const dev = createModelRegistryFromEnv({ NODE_ENV: 'development' });
    const prod = createModelRegistryFromEnv({ NODE_ENV: 'production' });
    const unset = createModelRegistryFromEnv({});

    expect(dev.get('mock')).toBeDefined();
    expect(prod.get('mock')).toBeUndefined();
    expect(unset.get('mock')).toBeUndefined();
  });

  test('Mock은 createMockAdapter와 같은 id·provider로 등록된다', () => {
    const registry = createModelRegistryFromEnv({ NODE_ENV: 'development' });
    const mock = createMockAdapter();

    const registered = registry.get(mock.id);
    expect(registered?.provider).toBe('mock');
    expect(registered?.available).toBe(true);
  });

  test('기본 모델 id는 provider:model 형식이고 기본은 Opus 5, 인덱싱 기본은 Haiku 4.5다', () => {
    expect(DEFAULT_MODEL_ID).toBe('anthropic:claude-opus-5');
    expect(INDEXING_DEFAULT_MODEL_ID).toBe('anthropic:claude-haiku-4-5-20251001');
  });
});

describe('createModelRegistryFromEnv — provider 어댑터 7개', () => {
  const EXPECTED = [
    {
      id: 'anthropic:claude-fable-5-1',
      label: 'Claude Fable 5.1',
      pricing: { inputPerMTok: 10, outputPerMTok: 50 },
    },
    {
      id: 'anthropic:claude-opus-5',
      label: 'Claude Opus 5',
      pricing: { inputPerMTok: 5, outputPerMTok: 25 },
    },
    {
      id: 'anthropic:claude-sonnet-5',
      label: 'Claude Sonnet 5',
      pricing: { inputPerMTok: 2, outputPerMTok: 10 },
    },
    {
      id: 'anthropic:claude-haiku-4-5-20251001',
      label: 'Claude Haiku 4.5',
      pricing: { inputPerMTok: 1, outputPerMTok: 5 },
    },
    { id: 'openai:gpt-5.5', label: 'GPT-5.5', pricing: { inputPerMTok: 5, outputPerMTok: 30 } },
    { id: 'openai:gpt-5.1', label: 'GPT-5.1', pricing: { inputPerMTok: 1.25, outputPerMTok: 10 } },
    {
      id: 'openai:gpt-5-mini',
      label: 'GPT-5 mini',
      pricing: { inputPerMTok: 0.25, outputPerMTok: 2 },
    },
  ];

  test('id·label·단가가 decisions/model-selection 표와 순서대로 일치한다(프로덕션은 Mock 없음)', () => {
    const registry = createModelRegistryFromEnv({ NODE_ENV: 'production' });

    expect(registry.list().map(({ id, label, pricing }) => ({ id, label, pricing }))).toEqual(
      EXPECTED,
    );
  });

  test('default는 Opus 5, indexingDefault는 Haiku 4.5로 해석된다', () => {
    const registry = createModelRegistryFromEnv({});

    expect(registry.default().id).toBe(DEFAULT_MODEL_ID);
    expect(registry.indexingDefault().id).toBe(INDEXING_DEFAULT_MODEL_ID);
  });

  test('API 키가 있는 provider의 어댑터만 available:true', () => {
    const onlyAnthropic = createModelRegistryFromEnv({ ANTHROPIC_API_KEY: 'sk-a' });
    const onlyOpenAi = createModelRegistryFromEnv({ OPENAI_API_KEY: 'sk-o' });
    const none = createModelRegistryFromEnv({});

    const availableIds = (r: ReturnType<typeof createModelRegistryFromEnv>) =>
      r
        .list()
        .filter((a) => a.available)
        .map((a) => a.id);

    expect(availableIds(onlyAnthropic)).toEqual(EXPECTED.slice(0, 4).map((m) => m.id));
    expect(availableIds(onlyOpenAi)).toEqual(EXPECTED.slice(4).map((m) => m.id));
    expect(availableIds(none)).toEqual([]);
  });

  test('provider 어댑터 뒤에 development에서만 Mock이 붙는다', () => {
    const dev = createModelRegistryFromEnv({ NODE_ENV: 'development' });

    expect(dev.list().map((a) => a.id)).toEqual([...EXPECTED.map((m) => m.id), 'mock']);
  });
});
