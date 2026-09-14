import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { RunStepView } from '../../../lib/run-detail';
import { RunTimeline } from './RunTimeline';

const STEP_LABELS = [
  '근거 수집',
  '벨로그 본문',
  '근거 검증',
  '링크드인',
  'Zenn',
  '발행정보·썸네일',
];

function step(overrides: Partial<RunStepView> & { name: string; order: number }): RunStepView {
  return {
    status: 'pending',
    origin: 'fresh',
    sourceRunId: null,
    sourceFinishedAt: null,
    errorCode: null,
    errorMessage: null,
    attemptCount: 0,
    modelId: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    durationMs: null,
    startedAt: null,
    finishedAt: null,
    ...overrides,
  };
}

const rows = () => screen.getAllByRole('listitem');
const markerLabel = (row: HTMLElement) => row.querySelector('[data-status] span')?.textContent;

describe('RunTimeline', () => {
  it('단계가 없어도 파이프라인 순서대로 6줄을 그린다(전부 대기)', () => {
    render(<RunTimeline steps={[]} />);

    const items = rows();
    expect(items).toHaveLength(6);
    STEP_LABELS.forEach((label, i) => {
      expect(items[i]!.textContent).toContain(label);
      expect(items[i]!.dataset.status).toBe('pending');
      expect(items[i]!.textContent).toContain('대기');
    });
  });

  it('DB 행 순서와 무관하게 파이프라인 순서를 지킨다', () => {
    render(
      <RunTimeline
        steps={[
          step({ name: 'zenn', order: 5, status: 'succeeded' }),
          step({ name: 'evidence', order: 1, status: 'succeeded' }),
        ]}
      />,
    );

    const items = rows();
    expect(items[0]!.textContent).toContain('근거 수집');
    expect(items[4]!.textContent).toContain('Zenn');
    expect(items[0]!.dataset.status).toBe('done');
    expect(items[4]!.dataset.status).toBe('done');
    expect(items[1]!.dataset.status).toBe('pending');
  });

  it('성공한 fresh 단계는 소요 시간과 토큰 합을 보여준다', () => {
    render(
      <RunTimeline
        steps={[
          step({
            name: 'velog',
            order: 2,
            status: 'succeeded',
            durationMs: 12_400,
            inputTokens: 1_200,
            outputTokens: 300,
          }),
        ]}
      />,
    );

    const row = rows()[1]!;
    expect(row.dataset.status).toBe('done');
    expect(markerLabel(row)).toBe('완료');
    expect(row.textContent).toContain('12초 · 1,500 토큰');
  });

  it('토큰이 없으면 소요 시간만 보여준다', () => {
    render(
      <RunTimeline
        steps={[step({ name: 'velog', order: 2, status: 'succeeded', durationMs: 3_000 })]}
      />,
    );

    const row = rows()[1]!;
    expect(row.textContent).toContain('3초');
    expect(row.textContent).not.toContain('토큰');
    expect(row.textContent).not.toContain(' · ');
  });

  it('carried 단계는 "이전 결과 · 시각"으로 표기하고 "건너뜀"을 쓰지 않는다', () => {
    const sourceFinishedAt = '2026-09-13T03:04:05.000Z';
    render(
      <RunTimeline
        steps={[
          step({
            name: 'evidence',
            order: 1,
            status: 'succeeded',
            origin: 'carried',
            sourceRunId: 'run-prev',
            sourceFinishedAt,
            durationMs: 5_000,
            inputTokens: 10,
            outputTokens: 10,
          }),
        ]}
      />,
    );

    const row = rows()[0]!;
    expect(row.dataset.status).toBe('done');
    expect(markerLabel(row)).toBe('이전 결과');
    expect(row.textContent).toContain(
      `이전 결과 · ${new Date(sourceFinishedAt).toLocaleString('ko-KR')}`,
    );
    expect(row.textContent).not.toContain('건너뜀');
    expect(row.textContent).not.toContain('토큰');
  });

  it('진행 중 단계는 active 마커와 "진행 중"', () => {
    render(<RunTimeline steps={[step({ name: 'verify', order: 3, status: 'running' })]} />);

    const row = rows()[2]!;
    expect(row.dataset.status).toBe('active');
    expect(markerLabel(row)).toBe('진행 중');
    expect(row.textContent).toContain('진행 중');
  });

  it('실패한 단계는 failed 마커와 사람이 읽는 메시지·시도 횟수(코드는 숨긴다)', () => {
    render(
      <RunTimeline
        steps={[
          step({
            name: 'linkedin',
            order: 4,
            status: 'failed',
            errorCode: 'STEP_TIMEOUT',
            errorMessage: '단계 제한 시간 10분을 넘겼습니다.',
            attemptCount: 3,
          }),
        ]}
      />,
    );

    const row = rows()[3]!;
    expect(row.dataset.status).toBe('failed');
    expect(markerLabel(row)).toBe('실패');
    expect(row.textContent).toContain('단계 제한 시간 10분을 넘겼습니다. · 3회 시도');
    expect(row.textContent).not.toContain('STEP_TIMEOUT');
  });

  it('실패 메시지가 없으면 에러 코드로 폴백한다', () => {
    render(
      <RunTimeline
        steps={[
          step({
            name: 'linkedin',
            order: 4,
            status: 'failed',
            errorCode: 'STEP_TIMEOUT',
            attemptCount: 1,
          }),
        ]}
      />,
    );

    expect(rows()[3]!.textContent).toContain('STEP_TIMEOUT · 1회 시도');
  });

  it('모르는 상태 값은 pending으로 그리고 값을 그대로 읽어준다', () => {
    render(<RunTimeline steps={[step({ name: 'zenn', order: 5, status: 'weird' })]} />);

    const row = rows()[4]!;
    expect(row.dataset.status).toBe('pending');
    expect(markerLabel(row)).toBe('weird');
  });
});
