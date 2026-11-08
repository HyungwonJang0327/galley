import { describe, it, expect, vi } from 'vitest';

const { registryGet } = vi.hoisted(() => ({ registryGet: vi.fn() }));
vi.mock('@galley/pipeline', () => ({
  createModelRegistryFromEnv: () => ({ get: registryGet }),
}));

import { createModelLabeler, formatCostUsd } from './model-label';

describe('createModelLabeler', () => {
  it('레지스트리의 label을, 없는 id는 id 그대로', () => {
    registryGet.mockImplementation((id: string) =>
      id === 'anthropic:x' ? { label: 'Claude X' } : undefined,
    );
    const label = createModelLabeler({ NODE_ENV: 'test' });

    expect(label('anthropic:x')).toBe('Claude X');
    expect(label('legacy:gone')).toBe('legacy:gone');
  });
});

describe('formatCostUsd', () => {
  it('소수 4자리 고정, $ 접두', () => {
    expect(formatCostUsd(0.01234567)).toBe('$0.0123');
    expect(formatCostUsd(0)).toBe('$0.0000');
    expect(formatCostUsd(12.5)).toBe('$12.5000');
  });
});
