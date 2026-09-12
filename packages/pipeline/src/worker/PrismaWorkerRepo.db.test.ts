// 워커 전체 흐름 통합 테스트: 실제 임시 SQLite + Mock StepRunner.
// **BW2의 완료 조건** — 큐 적재 → 실행 시작 → 6단계 → 승인 대기가 토큰 없이 한 번에 돈다.
import { describe, test, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createPrismaWorkerRepo } from './PrismaWorkerRepo.ts';
import { HEARTBEAT_TIMEOUT_MS, runOnce } from './runOnce.ts';
import { createMockStepRunner } from '../steps/MockStepRunner.ts';
import {
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  STEP_STATUS,
  planRerun,
} from '../run/stateMachine.ts';
import { startRun } from '../run/startRun.ts';
import { startRerun } from '../run/startRerun.ts';
import { approveRun, reviseRun } from '../run/runCommands.ts';
import type { StepContext, StepRunner } from '../steps/StepRunner.ts';
import { createModelRegistry } from '../model/ModelRegistry.ts';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import type { WorkerDeps } from './WorkerDeps.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

const adapter: ModelAdapter = {
  id: 'mock',
  label: 'mock',
  provider: 'mock',
  pricing: { inputPerMTok: 0, outputPerMTok: 0 },
  available: true,
  generate: () => Promise.reject(new Error('단계는 StepRunner가 돈다')),
};
const registry = createModelRegistry({
  adapters: [adapter],
  defaultId: 'mock',
  indexingDefaultId: 'mock',
});

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-worker-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

function makeDeps(overrides: Partial<WorkerDeps> = {}) {
  let current = new Date('2026-09-13T00:00:00Z');
  let n = 0;
  const deps: WorkerDeps = {
    workerId: overrides.workerId ?? 'worker_1',
    clock: { now: () => current },
    ids: { next: () => `id_${(n += 1)}` },
    // 단계가 즉시 끝나는 Mock이라 발화할 일이 없다 — 타이머는 등록만 받는다.
    timers: { every: () => () => {}, after: () => () => {} },
    logger: { info: vi.fn(), error: vi.fn() },
    repo: createPrismaWorkerRepo(prisma),
    stepRunner: createMockStepRunner(),
    ...overrides,
  };
  return {
    deps,
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}

/** 큐 항목 하나를 만들고 실행을 queued로 올린다(대시보드가 하는 일). */
async function queueAndStart() {
  const topic = await prisma.queueItem.create({ data: { title: '무한 스크롤', order: 0 } });
  const started = await startRun({ prisma, registry }, { topicId: topic.id });
  if (!started.ok) throw new Error(`실행이 만들어져야 한다: ${started.code}`);
  return started.run;
}

describe('워커 전체 흐름', () => {
  test('큐 → 실행 → 6단계 → 승인 대기가 한 번에 돈다(토큰 없이)', async () => {
    const run = await queueAndStart();
    const { deps } = makeDeps();

    // 잡는 틱 1 + 단계 6 + 승인 대기 1.
    const outcomes = [];
    for (let i = 0; i < STEP_ORDER.length + 2; i += 1) outcomes.push((await runOnce(deps)).outcome);

    expect(outcomes).toEqual(['claimed', ...STEP_ORDER.map(() => 'completed'), 'completed']);

    const after = await prisma.run.findUniqueOrThrow({
      where: { id: run.id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    expect(after.status).toBe(RUN_STATUS.pendingApproval);
    expect(after.steps.map((s) => s.name)).toEqual([...STEP_ORDER]);
    expect(after.steps.every((s) => s.status === STEP_STATUS.succeeded)).toBe(true);
    expect(after.steps.every((s) => s.attemptCount === 1)).toBe(true);
  });

  test('승인 대기가 되면 워커가 더 집어가지 않는다(사람 차례)', async () => {
    await queueAndStart();
    const { deps } = makeDeps();
    for (let i = 0; i < STEP_ORDER.length + 2; i += 1) await runOnce(deps);

    expect((await runOnce(deps)).outcome).toBe('idle');
  });

  test('모델 없는 단계는 토큰·비용이 비어 있다', async () => {
    const run = await queueAndStart();
    const { deps } = makeDeps();
    for (let i = 0; i < STEP_ORDER.length + 2; i += 1) await runOnce(deps);

    const steps = await prisma.runStep.findMany({ where: { runId: run.id } });
    const publishInfo = steps.find((s) => s.name === 'publishInfo');
    const velog = steps.find((s) => s.name === 'velog');

    expect(publishInfo?.modelId).toBeNull();
    expect(publishInfo?.inputTokens).toBeNull();
    expect(velog?.modelId).toBe('mock');
    expect(velog?.inputTokens).toBeGreaterThan(0);
  });
});

describe('실패와 회수', () => {
  test('영구 실패는 코드·문구·시도 횟수를 남기고 실행을 실패로 돌린다', async () => {
    const run = await queueAndStart();
    const { deps } = makeDeps({
      stepRunner: createMockStepRunner({
        failAt: { step: 'velog', code: 'MODEL_REFUSED', message: '모델이 거부했습니다.' },
      }),
    });

    for (let i = 0; i < 4; i += 1) await runOnce(deps);

    const after = await prisma.run.findUniqueOrThrow({
      where: { id: run.id },
      include: { steps: true },
    });
    const velog = after.steps.find((s) => s.name === 'velog');
    expect(after.status).toBe(RUN_STATUS.failed);
    expect(velog).toMatchObject({
      status: STEP_STATUS.failed,
      errorCode: 'MODEL_REFUSED',
      errorMessage: '모델이 거부했습니다.',
      attemptCount: 1,
    });
  });

  test('재시도로 성공하면 실패 기록이 남지 않는다', async () => {
    const run = await queueAndStart();
    const { deps } = makeDeps({
      stepRunner: createMockStepRunner({
        failAt: { step: 'evidence', code: 'TIMEOUT', retryable: true },
        failTimes: 2,
      }),
    });

    await runOnce(deps);
    await runOnce(deps);

    const evidence = await prisma.runStep.findFirstOrThrow({
      where: { runId: run.id, name: 'evidence' },
    });
    expect(evidence).toMatchObject({
      status: STEP_STATUS.succeeded,
      attemptCount: 3,
      errorCode: null,
      errorMessage: null,
    });
  });

  test('heartbeat가 끊기면 회수해 완료 단계 다음부터 이어 돈다', async () => {
    const run = await queueAndStart();
    const first = makeDeps();
    await runOnce(first.deps); // 잡기
    await runOnce(first.deps); // evidence 완료

    // 워커가 죽었다고 치고 시계를 타임아웃 너머로 옮긴다.
    const second = makeDeps();
    second.advance(HEARTBEAT_TIMEOUT_MS + 1000);
    expect((await runOnce(second.deps)).outcome).toBe('recovered');
    expect((await runOnce(second.deps)).outcome).toBe('claimed');
    const next = await runOnce(second.deps);

    // 다시 처음부터가 아니라 evidence 다음(velog)이다.
    expect(next.stepRef?.step).toBe('velog');
    const evidence = await prisma.runStep.findFirstOrThrow({
      where: { runId: run.id, name: 'evidence' },
    });
    expect(evidence.status).toBe(STEP_STATUS.succeeded);
  });

  test('종료 신호로 반환한 단계는 다음 기동이 30초를 기다리지 않고 바로 그 단계부터 돈다', async () => {
    const run = await queueAndStart();
    const discarded: string[] = [];
    let block: (() => void) | null = null;
    const started = new Promise<void>((resolve) => {
      block = resolve;
    });
    const mock = createMockStepRunner({ onDiscard: (ctx) => discarded.push(ctx.step) });
    const first = makeDeps({
      stepRunner: {
        run: async (ctx) => {
          if (ctx.step === 'velog') {
            block?.();
            await new Promise((_, reject) =>
              ctx.signal.addEventListener('abort', () => reject(ctx.signal.reason), { once: true }),
            );
          }
          return mock.run(ctx);
        },
        discard: mock.discard,
      },
    });
    const controller = new AbortController();
    await runOnce(first.deps, controller.signal); // 잡기
    await runOnce(first.deps, controller.signal); // evidence 완료
    const tick = runOnce(first.deps, controller.signal); // velog 도중
    await started;
    controller.abort(new Error('SIGTERM'));
    expect((await tick).outcome).toBe('released');
    expect(discarded).toEqual(['velog']);

    const afterRelease = await prisma.run.findUniqueOrThrow({
      where: { id: run.id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    expect(afterRelease).toMatchObject({ workerState: 'interrupted', workerId: null });
    expect(afterRelease.steps[1]).toMatchObject({
      name: 'velog',
      status: STEP_STATUS.pending,
      startedAt: null,
      attemptCount: 0,
    });

    // 새 프로세스(새 workerId). 시계를 옮기지 않아도 바로 잡는다.
    const second = makeDeps({ workerId: 'worker_2' });
    expect((await runOnce(second.deps)).outcome).toBe('claimed');
    expect((await runOnce(second.deps)).stepRef?.step).toBe('velog');
  });

  test('잡을 실행이 없으면 idle', async () => {
    const { deps } = makeDeps();

    expect(await runOnce(deps)).toEqual({ outcome: 'idle' });
  });
});

describe('재실행', () => {
  /** StepRunner가 받은 컨텍스트를 기록해 워커가 무엇을 넘겼는지 본다. */
  function recordingRunner(): { runner: StepRunner; seen: StepContext[] } {
    const inner = createMockStepRunner();
    const seen: StepContext[] = [];
    return {
      seen,
      runner: {
        run(ctx) {
          seen.push(ctx);
          return inner.run(ctx);
        },
      },
    };
  }

  /** 첫 실행을 승인 대기까지 돌린 뒤, 본문부터 다시 도는 두 번째 시도를 queued로 만든다. */
  async function rerunFromVelog(instruction: string) {
    const first = await queueAndStart();
    const { deps } = makeDeps();
    for (let i = 0; i < STEP_ORDER.length + 2; i += 1) await runOnce(deps);

    const second = await startRerun(
      { prisma, registry },
      { previousRunId: first.id, plan: planRerun({ instruction }), instruction },
    );
    if (!second.ok) throw new Error(`재실행이 만들어져야 한다: ${second.code}`);
    return { first, second: second.run };
  }

  test('carried 단계는 건너뛰고 시작 단계부터 돌아 승인 대기로 간다', async () => {
    const { first, second } = await rerunFromVelog('도입부를 짧게');
    const { deps } = makeDeps();

    expect((await runOnce(deps)).outcome).toBe('claimed');
    // 근거 수집이 아니라 본문부터.
    expect((await runOnce(deps)).stepRef).toEqual({ runId: second.id, step: 'velog' });
    for (let i = 0; i < STEP_ORDER.length - 2; i += 1) await runOnce(deps);
    expect((await runOnce(deps)).outcome).toBe('completed');

    const after = await prisma.run.findUniqueOrThrow({
      where: { id: second.id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    expect(after.status).toBe(RUN_STATUS.pendingApproval);
    expect(after.steps[0]).toMatchObject({
      name: 'evidence',
      status: STEP_STATUS.succeeded,
      origin: STEP_ORIGIN.carried,
      sourceRunId: first.id,
      // 이번 실행에서 돌지 않았다 — 시각·시도 횟수가 비어 있다.
      startedAt: null,
      finishedAt: null,
      attemptCount: 0,
    });
    for (const step of after.steps.slice(1)) {
      expect(step).toMatchObject({
        status: STEP_STATUS.succeeded,
        origin: STEP_ORIGIN.fresh,
        sourceRunId: null,
        attemptCount: 1,
      });
    }
  });

  test('StepRunner는 수정 지시를 받고, 첫 실행에서는 받지 않는다', async () => {
    const { first, second } = await rerunFromVelog('도입부를 짧게');
    const { runner, seen } = recordingRunner();
    const { deps } = makeDeps({ stepRunner: runner });
    for (let i = 0; i < STEP_ORDER.length + 1; i += 1) await runOnce(deps);

    expect(seen.map((ctx) => ctx.step)).toEqual(STEP_ORDER.slice(1));
    expect(seen.every((ctx) => ctx.runId === second.id)).toBe(true);
    expect(seen.every((ctx) => ctx.instruction === '도입부를 짧게')).toBe(true);

    // 첫 실행 Run에는 지시가 없다.
    const firstRun = await prisma.run.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstRun.instruction).toBeNull();
    expect(firstRun.startStep).toBeNull();
  });
});

describe('승인 게이트 → 워커', () => {
  test('수정 지시로 생긴 다음 시도를 워커가 집어가 돌리고, 직전은 revised로 남는다', async () => {
    const first = await queueAndStart();
    const { deps } = makeDeps();
    for (let i = 0; i < STEP_ORDER.length + 2; i += 1) await runOnce(deps);

    const revised = await reviseRun(
      { prisma, registry },
      { runId: first.id, instruction: '검증을 다시', startStep: 'verify' },
    );
    if (!revised.ok) throw new Error(revised.code);

    // 잡기 1 + verify·linkedin·zenn·publishInfo 4 + 승인 대기 1.
    const outcomes = [];
    for (let i = 0; i < 6; i += 1) outcomes.push((await runOnce(deps)).outcome);
    expect(outcomes).toEqual([
      'claimed',
      'completed',
      'completed',
      'completed',
      'completed',
      'completed',
    ]);

    const [previous, next] = await Promise.all([
      prisma.run.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.run.findUniqueOrThrow({ where: { id: revised.run.id } }),
    ]);
    expect(previous.status).toBe(RUN_STATUS.revised);
    expect(previous.finishedAt).not.toBeNull();
    expect(next).toMatchObject({ status: RUN_STATUS.pendingApproval, attempt: 2 });

    // 승인하면 워커는 더 할 일이 없다.
    expect(await approveRun(prisma, next.id)).toMatchObject({ ok: true });
    expect((await runOnce(deps)).outcome).toBe('idle');
  });
});
