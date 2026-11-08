import { describe, it, expect, vi, afterEach } from 'vitest';

const {
  reloadQueue,
  moveQueueRow,
  reorderQueueRow,
  revalidatePath,
  getTopicEvidence,
  searchTopicEvidence,
  addTopicEvidence,
  removeTopicEvidence,
} = vi.hoisted(() => ({
  reloadQueue: vi.fn(),
  moveQueueRow: vi.fn(),
  reorderQueueRow: vi.fn(),
  revalidatePath: vi.fn(),
  getTopicEvidence: vi.fn(),
  searchTopicEvidence: vi.fn(),
  addTopicEvidence: vi.fn(),
  removeTopicEvidence: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../lib/queue-reload', () => ({ reloadQueue }));
vi.mock('../../../lib/queue-move', () => ({ moveQueueRow }));
vi.mock('../../../lib/queue-reorder', () => ({ reorderQueueRow }));
vi.mock('../../../lib/topic-evidence', () => ({
  getTopicEvidence,
  searchTopicEvidence,
  addTopicEvidence,
  removeTopicEvidence,
}));

import {
  addTopicEvidenceAction,
  loadTopicEvidenceAction,
  moveQueueRowAction,
  reloadQueueAction,
  removeTopicEvidenceAction,
  reorderQueueRowAction,
  searchTopicEvidenceAction,
} from './actions';

const INPUT = { from: 'waiting', to: 'hold', index: 1, title: '주제' } as const;

const REORDER_INPUT = { status: 'waiting', from: 2, to: 0, title: '주제' } as const;

afterEach(() => {
  reloadQueue.mockReset();
  moveQueueRow.mockReset();
  reorderQueueRow.mockReset();
  revalidatePath.mockReset();
  getTopicEvidence.mockReset();
  searchTopicEvidence.mockReset();
  addTopicEvidence.mockReset();
  removeTopicEvidence.mockReset();
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

describe('근거 편집 액션', () => {
  it('목록·검색은 읽기만 — 다시 그리지 않는다', async () => {
    const list = { ok: true, data: { links: [] } };
    getTopicEvidence.mockResolvedValue(list);
    expect(await loadTopicEvidenceAction('t1')).toEqual(list);
    expect(getTopicEvidence).toHaveBeenCalledWith('t1');

    const search = { ok: true, data: { hits: [] } };
    searchTopicEvidence.mockResolvedValue(search);
    expect(await searchTopicEvidenceAction('t1', 'react')).toEqual(search);
    expect(searchTopicEvidence).toHaveBeenCalledWith('t1', 'react');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('추가·제거는 성공했을 때만 레이아웃 전체를 다시 그린다(큐 행 "근거 n건")', async () => {
    addTopicEvidence.mockResolvedValue({ ok: true });
    expect(await addTopicEvidenceAction('t1', 'a1')).toEqual({ ok: true });
    expect(addTopicEvidence).toHaveBeenCalledWith('t1', 'a1');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    revalidatePath.mockReset();

    const failure = {
      ok: false,
      error: { code: 'LINK_NOT_FOUND', message: '이미 뗀 근거입니다.' },
    };
    removeTopicEvidence.mockResolvedValue(failure);
    expect(await removeTopicEvidenceAction('t1', 'a1')).toEqual(failure);
    expect(revalidatePath).not.toHaveBeenCalled();

    removeTopicEvidence.mockResolvedValue({ ok: true });
    expect(await removeTopicEvidenceAction('t1', 'a1')).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
