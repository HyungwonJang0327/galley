import { describe, it, expect } from 'vitest';
import type { RunHistoryItem, RunHistoryStep } from '@galley/pipeline';
import { formatDuration, formatTokens, runHistoryRow } from './run-history';

function step(name: string, overrides: Partial<RunHistoryStep> = {}): RunHistoryStep {
  return {
    name,
    status: 'succeeded',
    origin: 'fresh',
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    durationMs: null,
    ...overrides,
  };
}

function item(overrides: Partial<RunHistoryItem> = {}): RunHistoryItem {
  return {
    id: 'run-1',
    topicId: 'topic-1',
    attempt: 1,
    topicSlug: 'topic',
    topicTitle: '주제',
    status: 'pendingApproval',
    modelId: 'anthropic:x',
    startedAt: new Date('2026-11-15T03:04:00.000Z'),
    finishedAt: null,
    steps: [],
    ...overrides,
  };
}

const label = (id: string) => (id === 'anthropic:x' ? 'Claude X' : id);

describe('runHistoryRow', () => {
  it('fresh 단계만 더한다 — carried는 이전 시도의 사용량', () => {
    const row = runHistoryRow(
      item({
        attempt: 2,
        steps: [
          step('evidence', {
            origin: 'carried',
            inputTokens: 999,
            outputTokens: 999,
            costUsd: 9,
            durationMs: 99_000,
          }),
          step('velog', {
            inputTokens: 1000,
            outputTokens: 200,
            costUsd: 0.0123,
            durationMs: 3400,
          }),
          step('verify', { inputTokens: 500, outputTokens: 0, costUsd: 0.001, durationMs: 1600 }),
          step('linkedin', { status: 'pending' }),
        ],
      }),
      label,
    );

    expect(row.tokens).toBe(1700);
    expect(row.tokensText).toBe('1,700');
    expect(row.costUsd).toBeCloseTo(0.0133);
    expect(row.costText).toBe('$0.0133');
    expect(row.durationMs).toBe(5000);
    expect(row.durationText).toBe('5초');
    expect(row.attempt).toBe(2);
    expect(row.model).toBe('Claude X');
  });

  it('단계 기록이 없으면 합계는 null·"—", 마지막 단계는 "대기", 완료 0/7', () => {
    const row = runHistoryRow(item(), label);

    expect(row.tokens).toBeNull();
    expect(row.tokensText).toBe('—');
    expect(row.costText).toBe('—');
    expect(row.durationText).toBe('—');
    expect(row.lastStep).toBe('대기');
    expect(row.doneCount).toBe(0);
    expect(row.stepCount).toBe(7);
  });

  it('마지막으로 손댄 단계와 완료 수, carried 성공은 "이전 결과"로 읽힌다', () => {
    const row = runHistoryRow(
      item({
        steps: [
          step('evidence', { origin: 'carried' }),
          step('velog'),
          step('verify', { status: 'failed' }),
        ],
      }),
      label,
    );

    expect(row.lastStep).toBe('근거 검증 실패');
    expect(row.doneCount).toBe(2);
    expect(row.badge.label).toBe('승인 대기');
  });

  it('링크는 종결 여부에 맞는 탭 + id, 시작 시각은 ISO와 짧은 표기', () => {
    const active = runHistoryRow(item(), label);
    const done = runHistoryRow(
      item({ status: 'done', finishedAt: new Date('2026-11-15T04:00:00.000Z') }),
      label,
    );

    expect(active.href).toBe('/runs?tab=active&id=run-1');
    expect(done.href).toBe('/runs?tab=done&id=run-1');
    expect(active.startedAt).toBe('2026-11-15T03:04:00.000Z');
    expect(active.startedAtText).toMatch(/11\. 15\./);
  });

  it('비용·토큰 0은 "—"가 아니라 0으로 보인다(기록 없음과 구분)', () => {
    const row = runHistoryRow(
      item({ steps: [step('evidence', { inputTokens: 0, outputTokens: 0, costUsd: 0 })] }),
      label,
    );

    expect(row.tokensText).toBe('0');
    expect(row.costText).toBe('$0.0000');
  });
});

describe('formatDuration', () => {
  it('1초 미만은 소수 1자리, 그 위는 초·분·시간', () => {
    expect(formatDuration(0)).toBe('0.0초');
    expect(formatDuration(870)).toBe('0.9초');
    expect(formatDuration(45_000)).toBe('45초');
    expect(formatDuration(192_000)).toBe('3분 12초');
    expect(formatDuration(180_000)).toBe('3분');
    expect(formatDuration(3_900_000)).toBe('1시간 5분');
    expect(formatDuration(3_600_000)).toBe('1시간');
  });
});

describe('formatTokens', () => {
  it('천 단위 구분', () => {
    expect(formatTokens(1234567)).toBe('1,234,567');
  });
});
