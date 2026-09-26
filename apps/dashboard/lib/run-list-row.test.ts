import { describe, it, expect } from 'vitest';
import type { RunListRow } from './run-list';
import { evidenceFlagText, formatShortDateTime, runListRowView } from './run-list-row';

function row(overrides: Partial<RunListRow> = {}): RunListRow {
  return {
    id: 'run-1',
    topicId: 'topic-1',
    attempt: 1,
    topicSlug: 'topic',
    topicTitle: '주제',
    status: 'running',
    modelId: 'anthropic:x',
    startedAt: '2026-09-14T07:41:00.000Z',
    finishedAt: null,
    steps: [],
    ...overrides,
  };
}

describe('runListRowView', () => {
  it('단계 행이 없어도 파이프라인 순서 6칸 전부 pending, 마지막 단계는 "대기"', () => {
    const view = runListRowView(row());

    expect(view.dots.map((d) => d.name)).toEqual([
      'evidence',
      'velog',
      'verify',
      'linkedin',
      'zenn',
      'publishInfo',
    ]);
    expect(view.dots.every((d) => d.status === 'pending')).toBe(true);
    expect(view.lastStep).toBe('대기');
  });

  it('마지막으로 손댄 단계를 "단계명 상태"로 미리보기한다', () => {
    const view = runListRowView(
      row({
        steps: [
          { name: 'evidence', status: 'succeeded', origin: 'fresh', sourceRunId: null },
          { name: 'velog', status: 'running', origin: 'fresh', sourceRunId: null },
        ],
      }),
    );

    expect(view.dots.slice(0, 3).map((d) => d.status)).toEqual(['done', 'active', 'pending']);
    expect(view.lastStep).toBe('벨로그 본문 진행 중');
  });

  it('실패한 단계가 마지막이면 "단계명 실패"', () => {
    const view = runListRowView(
      row({
        status: 'failed',
        steps: [
          { name: 'evidence', status: 'succeeded', origin: 'fresh', sourceRunId: null },
          { name: 'velog', status: 'failed', origin: 'fresh', sourceRunId: null },
        ],
      }),
    );

    expect(view.dots[1]!.status).toBe('failed');
    expect(view.lastStep).toBe('벨로그 본문 실패');
  });

  it('carried 단계는 done 점에 "이전 결과" 라벨', () => {
    const view = runListRowView(
      row({
        steps: [{ name: 'evidence', status: 'succeeded', origin: 'carried', sourceRunId: null }],
      }),
    );

    expect(view.dots[0]).toEqual({
      name: 'evidence',
      status: 'done',
      label: '근거 수집 이전 결과',
    });
  });

  it('DB 행 순서와 무관하게 파이프라인 순서로 마지막 단계를 고른다', () => {
    const view = runListRowView(
      row({
        steps: [
          { name: 'verify', status: 'succeeded', origin: 'fresh', sourceRunId: null },
          { name: 'evidence', status: 'succeeded', origin: 'fresh', sourceRunId: null },
          { name: 'velog', status: 'succeeded', origin: 'fresh', sourceRunId: null },
        ],
      }),
    );

    expect(view.lastStep).toBe('근거 검증 완료');
  });

  it('시간은 종결 시각 우선, 없으면 시작 시각', () => {
    const started = '2026-09-14T07:41:00.000Z';
    const finished = '2026-09-14T09:00:00.000Z';

    expect(runListRowView(row({ startedAt: started })).time).toBe(formatShortDateTime(started));
    expect(runListRowView(row({ startedAt: started, finishedAt: finished })).time).toBe(
      formatShortDateTime(finished),
    );
  });
});

describe('formatShortDateTime', () => {
  it('월·일·시·분만 — 연도·초 없음', () => {
    const text = formatShortDateTime('2026-09-14T07:41:00.000Z');

    expect(text).not.toContain('2026');
    expect(text).toMatch(/\d{1,2}\. \d{1,2}\. \d{2}:\d{2}/);
  });
});

describe('evidenceFlagText', () => {
  it('근거 없음이 1 이상일 때만 "근거 없음 n", 아니면 없음', () => {
    expect(evidenceFlagText({ unsupported: 3, uncertain: 1 })).toBe('근거 없음 3');
    expect(evidenceFlagText({ unsupported: 0, uncertain: 5 })).toBeUndefined();
    expect(evidenceFlagText(undefined)).toBeUndefined();
  });
});
