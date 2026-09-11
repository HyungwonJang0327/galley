import { describe, it, expect, vi, afterEach } from 'vitest';

const { reloadQueue, revalidatePath } = vi.hoisted(() => ({
  reloadQueue: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../lib/queue-reload', () => ({ reloadQueue }));

import { reloadQueueAction } from './actions';

afterEach(() => {
  reloadQueue.mockReset();
  revalidatePath.mockReset();
});

describe('reloadQueueAction', () => {
  it('적재 결과를 돌려주고 레이아웃 전체를 다시 그린다', async () => {
    const success = { ok: true, data: { summary: '요약' } };
    reloadQueue.mockResolvedValue(success);

    expect(await reloadQueueAction()).toEqual(success);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('적재 실패도 형태로 돌려준다', async () => {
    const failure = { ok: false, error: { code: 'BLOG_DIR_MISSING', message: '없음' } };
    reloadQueue.mockResolvedValue(failure);

    expect(await reloadQueueAction()).toEqual(failure);
  });
});
