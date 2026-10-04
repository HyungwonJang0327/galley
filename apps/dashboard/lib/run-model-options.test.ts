import { describe, it, expect, vi, beforeEach } from 'vitest';

const adapter = (
  id: string,
  provider: 'anthropic' | 'openai' | 'mock',
  available: boolean,
  pricing = { inputPerMTok: 5, outputPerMTok: 25 },
) => ({ id, label: `${id} 이름`, provider, available, pricing });

const { getDefaultModel, createModelRegistryFromEnv, adapters } = vi.hoisted(() => ({
  getDefaultModel: vi.fn(),
  createModelRegistryFromEnv: vi.fn(),
  adapters: [] as ReturnType<typeof adapter>[],
}));

// 실제 레지스트리·SQLite 대신 pipeline 경계만 가짜로(폴백 규칙은 pipeline 통합 테스트가 본다).
vi.mock('@galley/pipeline', () => ({ prisma: {}, getDefaultModel, createModelRegistryFromEnv }));

import { getRunModelChoices } from './run-model-options';

beforeEach(() => {
  adapters.length = 0;
  adapters.push(
    adapter('anthropic:a', 'anthropic', true),
    adapter('openai:b', 'openai', false, { inputPerMTok: 1.25, outputPerMTok: 10 }),
    adapter('mock', 'mock', true, { inputPerMTok: 0, outputPerMTok: 0 }),
  );
  createModelRegistryFromEnv.mockReturnValue({ list: () => adapters, default: () => adapters[0] });
  getDefaultModel.mockReset();
});

describe('getRunModelChoices', () => {
  it('레지스트리 순서대로 label·provider·단가·비활성 사유를 만든다', async () => {
    getDefaultModel.mockResolvedValue(adapters[0]);

    expect((await getRunModelChoices()).options).toEqual([
      {
        value: 'anthropic:a',
        label: 'anthropic:a 이름',
        description: 'Anthropic',
        meta: '$5 / $25',
        disabled: false,
        disabledReason: undefined,
      },
      {
        value: 'openai:b',
        label: 'openai:b 이름',
        description: 'OpenAI',
        meta: '$1.25 / $10',
        disabled: true,
        disabledReason: 'API 키 없음 (.env OPENAI_API_KEY)',
      },
      {
        value: 'mock',
        label: 'mock 이름',
        description: 'Mock (개발용)',
        meta: '$0 / $0',
        disabled: false,
        disabledReason: undefined,
      },
    ]);
  });

  it('초기값은 설정의 기본 모델', async () => {
    getDefaultModel.mockResolvedValue(adapters[2]);

    expect((await getRunModelChoices()).initialId).toBe('mock');
  });

  it('기본 모델에 키가 없으면 첫 실행 가능 모델이 초기값', async () => {
    getDefaultModel.mockResolvedValue(adapters[1]);

    expect((await getRunModelChoices()).initialId).toBe('anthropic:a');
  });

  it('실행 가능한 모델이 없으면 초기값 없음', async () => {
    for (const a of adapters) a.available = false;
    getDefaultModel.mockResolvedValue(adapters[0]);

    expect((await getRunModelChoices()).initialId).toBeUndefined();
  });

  it('기본 모델 조회가 실패해도 던지지 않고 레지스트리 기본으로 둔다', async () => {
    getDefaultModel.mockRejectedValue(new Error('no such table: Setting'));

    expect((await getRunModelChoices()).initialId).toBe('anthropic:a');
  });
});
