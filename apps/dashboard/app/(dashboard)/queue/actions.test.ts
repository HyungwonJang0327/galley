import { describe, it, expect, vi, afterEach } from 'vitest';

const { reloadQueue, moveQueueRow, revalidatePath } = vi.hoisted(() => ({
  reloadQueue: vi.fn(),
  moveQueueRow: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../lib/queue-reload', () => ({ reloadQueue }));
vi.mock('../../../lib/queue-move', () => ({ moveQueueRow }));

import { moveQueueRowAction, reloadQueueAction } from './actions';

const INPUT = { from: '대기', to: '보류', index: 1, title: '주제' } as const;

afterEach(() => {
  reloadQueue.mockReset();
  moveQueueRow.mockReset();
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

describe('moveQueueRowAction', () => {
  it('이동에 성공하면 레이아웃 전체를 다시 그린다', async () => {
    moveQueueRow.mockResolvedValue({ ok: true });

    expect(await moveQueueRowAction(INPUT)).toEqual({ ok: true });
    expect(moveQueueRow).toHaveBeenCalledWith(INPUT);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('이동에 실패하면 다시 그리지 않고 사유를 돌려준다', async () => {
    const failure = { ok: false, error: { code: 'TOPIC_MISMATCH', message: '바뀜' } };
    moveQueueRow.mockResolvedValue(failure);

    expect(await moveQueueRowAction(INPUT)).toEqual(failure);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
