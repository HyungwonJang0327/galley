// 실행 상세(2분할 화면 우측) 데이터(서버 전용). 실행 하나 + 단계 6행을 직렬화한다.
// 없는 id는 RUN_NOT_FOUND(화면이 "선택된 실행 없음" 안내), 그 밖은 RUN_DETAIL_FAILED.
import 'server-only';
import { getRunWithSteps, prisma, type RunDetail, type RunStepDetail } from '@galley/pipeline';
import { createModelLabeler } from './model-label';
import type { RunRecord } from './run-commands';

export interface RunStepView {
  name: string;
  order: number;
  status: string;
  origin: string;
  sourceRunId: string | null;
  /** carried일 때 원본 단계가 끝난 시각(ISO). "이전 결과 · {시각}"에 쓴다. */
  sourceFinishedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attemptCount: number;
  modelId: string | null;
  /** 단계 모델의 label(없는 id는 id). 타임라인은 Run 모델과 다를 때만 보여 준다(decisions/model-selection.md). */
  modelLabel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunDetailView extends RunRecord {
  /** Run 모델의 label — 헤더 상태 배지 옆(작은 회색). */
  modelLabel: string;
  workerState: string;
  heartbeat: string | null;
  instruction: string | null;
  startStep: string | null;
  steps: RunStepView[];
}

export type RunDetailErrorCode = 'RUN_NOT_FOUND' | 'RUN_DETAIL_FAILED';
export type RunDetailResult =
  | { ok: true; data: RunDetailView }
  | { ok: false; error: { code: RunDetailErrorCode; message: string } };

const iso = (value: Date | null) => (value === null ? null : value.toISOString());

function toStepView(step: RunStepDetail, label: (id: string) => string): RunStepView {
  return {
    ...step,
    modelLabel: step.modelId === null ? null : label(step.modelId),
    sourceFinishedAt: iso(step.sourceFinishedAt),
    startedAt: iso(step.startedAt),
    finishedAt: iso(step.finishedAt),
  };
}

function toView(run: RunDetail, label: (id: string) => string): RunDetailView {
  return {
    id: run.id,
    topicId: run.topicId,
    attempt: run.attempt,
    topicSlug: run.topicSlug,
    topicTitle: run.topicTitle,
    status: run.status,
    modelId: run.modelId,
    modelLabel: label(run.modelId),
    startedAt: run.startedAt.toISOString(),
    finishedAt: iso(run.finishedAt),
    workerState: run.workerState,
    heartbeat: iso(run.heartbeat),
    instruction: run.instruction,
    startStep: run.startStep,
    steps: run.steps.map((step) => toStepView(step, label)),
  };
}

export async function getRunDetail(runId: string): Promise<RunDetailResult> {
  try {
    const run = await getRunWithSteps(prisma, runId);
    if (!run) {
      return { ok: false, error: { code: 'RUN_NOT_FOUND', message: '실행을 찾을 수 없습니다.' } };
    }
    return { ok: true, data: toView(run, createModelLabeler()) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: { code: 'RUN_DETAIL_FAILED', message: `실행 상세를 불러오지 못했습니다: ${reason}` },
    };
  }
}
