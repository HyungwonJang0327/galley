import { describe, it, expect, vi, afterEach } from 'vitest';

const { reloadQueue, moveQueueRow, reorderQueueRow, revalidatePath } = vi.hoisted(() => ({
  reloadQueue: vi.fn(),
  moveQueueRow: vi.fn(),
  reorderQueueRow: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../lib/queue-reload', () => ({ reloadQueue }));
vi.mock('../../../lib/queue-move', () => ({ moveQueueRow }));
vi.mock('../../../lib/queue-reorder', () => ({ reorderQueueRow }));

import { moveQueueRowAction, reloadQueueAction, reorderQueueRowAction } from './actions';

const INPUT = { from: '대기', to: '보류', index: 1, title: '주제' } as const;

const REORDER_INPUT = { status: '대기', from: 2, to: 0, title: '주제' } as const;

afterEach(() => {
  reloadQueue.mockReset();
  moveQueueRow.mockReset();
  reorderQueueRow.mockReset();
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

describe('reorderQueueRowAction', () => {
  it('순서 변경에 성공하면 레이아웃 전체를 다시 그린다', async () => {
    reorderQueueRow.mockResolvedValue({ ok: true });

    expect(await reorderQueueRowAction(REORDER_INPUT)).toEqual({ ok: true });
    expect(reorderQueueRow).toHaveBeenCalledWith(REORDER_INPUT);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('실패하면 다시 그리지 않고 사유를 돌려준다', async () => {
    const failure = { ok: false, error: { code: 'INVALID_POSITION', message: '위치' } };
    reorderQueueRow.mockResolvedValue(failure);

    expect(await reorderQueueRowAction(REORDER_INPUT)).toEqual(failure);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
