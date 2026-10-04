import { describe, it, expect, vi, beforeEach } from 'vitest';

const adapter = (id: string, available = true) => ({
  id,
  label: `${id} 이름`,
  provider: 'anthropic' as const,
  available,
  pricing: { inputPerMTok: 5, outputPerMTok: 25 },
});

const { getDefaultModel, setDefaultModelId, createModelRegistryFromEnv, adapters } = vi.hoisted(
  () => ({
    getDefaultModel: vi.fn(),
    setDefaultModelId: vi.fn(),
    createModelRegistryFromEnv: vi.fn(),
    adapters: [] as ReturnType<typeof adapter>[],
  }),
);

// 실제 레지스트리·SQLite 대신 pipeline 경계만 가짜로(저장·폴백 규칙은 pipeline 통합 테스트가 본다).
vi.mock('@galley/pipeline', () => ({
  prisma: {},
  getDefaultModel,
  setDefaultModelId,
  createModelRegistryFromEnv,
}));

import { changeDefaultModel, getDefaultModelSetting } from './default-model-setting';

beforeEach(() => {
  adapters.length = 0;
  adapters.push(adapter('anthropic:a'), adapter('anthropic:b'), adapter('anthropic:no-key', false));
  createModelRegistryFromEnv.mockReturnValue({
    list: () => adapters,
    get: (id: string) => adapters.find((a) => a.id === id),
    default: () => adapters[0],
  });
  getDefaultModel.mockReset();
  setDefaultModelId.mockReset();
});

describe('getDefaultModelSetting', () => {
  it('선택지(레지스트리 순서)와 지금의 기본 모델을 돌려준다', async () => {
    getDefaultModel.mockResolvedValue(adapters[1]);

    const setting = await getDefaultModelSetting();

    expect(setting.currentId).toBe('anthropic:b');
    expect(setting.options.map((o) => [o.value, o.disabled])).toEqual([
      ['anthropic:a', false],
      ['anthropic:b', false],
      ['anthropic:no-key', true],
    ]);
  });

  it('조회가 실패해도 던지지 않고 레지스트리 기본을 보인다', async () => {
    getDefaultModel.mockRejectedValue(new Error('no such table: Setting'));

    expect((await getDefaultModelSetting()).currentId).toBe('anthropic:a');
  });
});

describe('changeDefaultModel', () => {
  it('저장에 성공하면 ok', async () => {
    setDefaultModelId.mockResolvedValue({ ok: true });

    expect(await changeDefaultModel('anthropic:b')).toEqual({ ok: true });
    expect(setDefaultModelId.mock.calls[0]?.[2]).toBe('anthropic:b');
  });

  it('레지스트리에 없는 모델은 코드와 한국어 문구로 거절한다', async () => {
    setDefaultModelId.mockResolvedValue({ ok: false, code: 'UNKNOWN_MODEL' });

    expect(await changeDefaultModel('없음')).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_MODEL', message: '등록되지 않은 모델입니다.' },
    });
  });

  it('키 없는 모델은 저장하지 않는다', async () => {
    expect(await changeDefaultModel('anthropic:no-key')).toMatchObject({
      ok: false,
      error: { code: 'MODEL_UNAVAILABLE' },
    });
    expect(setDefaultModelId).not.toHaveBeenCalled();
  });

  it('저장이 던져도 값으로 돌려준다', async () => {
    setDefaultModelId.mockRejectedValue(new Error('db locked'));

    expect(await changeDefaultModel('anthropic:b')).toMatchObject({
      ok: false,
      error: { code: 'SETTING_SAVE_FAILED' },
    });
  });
});
