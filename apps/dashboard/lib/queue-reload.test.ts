import { describe, it, expect, vi, afterEach } from 'vitest';
import type { QueueSections } from '@galley/pipeline';

const { getQueueSections } = vi.hoisted(() => ({ getQueueSections: vi.fn() }));

// 적재 자체는 queue-data·pipeline 테스트가 본다. 여기선 결과를 요약하는 것만.
vi.mock('./queue-data', () => ({ getQueueSections }));

import { queueReloadSummary, reloadQueue } from './queue-reload';

const topic = (title: string) => ({ title, category: null, completedOn: null });

const SECTIONS: QueueSections = {
  대기: [topic('가'), topic('나')],
  후보: [topic('다')],
  보류: [],
  완료: [topic('라'), topic('마'), topic('바')],
};

afterEach(() => {
  getQueueSections.mockReset();
});

describe('queueReloadSummary', () => {
  it('탭 순서대로 섹션별 개수를 한 줄로 만든다', () => {
    expect(queueReloadSummary(SECTIONS)).toBe(
      '주제_큐.md 기준으로 맞췄습니다: 대기 2 · 후보 1 · 보류 0 · 완료 3',
    );
  });
});

describe('reloadQueue', () => {
  it('적재에 성공하면 요약을 돌려준다', async () => {
    getQueueSections.mockResolvedValue({ ok: true, data: SECTIONS });

    const result = await reloadQueue();

    expect(result).toEqual({
      ok: true,
      data: { summary: '주제_큐.md 기준으로 맞췄습니다: 대기 2 · 후보 1 · 보류 0 · 완료 3' },
    });
    expect(getQueueSections).toHaveBeenCalledTimes(1);
  });

  it('적재 실패는 그대로 돌려준다(던지지 않음)', async () => {
    const failure = {
      ok: false,
      error: { code: 'QUEUE_LOAD_FAILED', message: '주제_큐.md를 불러오지 못했습니다: ENOENT' },
    };
    getQueueSections.mockResolvedValue(failure);

    expect(await reloadQueue()).toEqual(failure);
  });
});
