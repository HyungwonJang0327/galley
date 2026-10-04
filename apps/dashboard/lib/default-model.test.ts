import { describe, it, expect, vi, afterEach } from 'vitest';

const { getDefaultModel, createModelRegistryFromEnv } = vi.hoisted(() => ({
  getDefaultModel: vi.fn(),
  createModelRegistryFromEnv: vi.fn(() => ({ default: () => ({ label: '레지스트리 기본' }) })),
}));

// 실제 SQLite 대신 pipeline 경계만 가짜로(저장·폴백 규칙은 pipeline 통합 테스트가 본다).
vi.mock('@galley/pipeline', () => ({ prisma: {}, getDefaultModel, createModelRegistryFromEnv }));

import { getDefaultModelLabel } from './default-model';

afterEach(() => {
  getDefaultModel.mockReset();
});

describe('getDefaultModelLabel', () => {
  it('설정의 기본 모델 label을 돌려준다', async () => {
    getDefaultModel.mockResolvedValue({ label: '설정한 모델' });

    expect(await getDefaultModelLabel()).toBe('설정한 모델');
  });

  it('조회가 실패해도 던지지 않고 레지스트리 기본 label로 둔다(셸이 죽지 않게)', async () => {
    getDefaultModel.mockRejectedValue(new Error('no such table: Setting'));

    expect(await getDefaultModelLabel()).toBe('레지스트리 기본');
  });
});
