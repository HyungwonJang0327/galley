// 승인·수정 지시·미리보기 통합 테스트(실제 임시 SQLite). 워커 흐름은 PrismaWorkerRepo.db.test가 본다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { createModelRegistry } from '../model/ModelRegistry.ts';
import { approveRun, previewRerun, reviseRun } from './runCommands.ts';
import {
  INSTRUCTION_MAX_LENGTH,
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  STEP_STATUS,
  type RunStatus,
} from './stateMachine.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-run-commands-db-'));
  const url = `file:${join(dbDir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

let topicId: string;

beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.queueItem.deleteMany();
  topicId = (await prisma.queueItem.create({ data: { title: '무한 스크롤', order: 0 } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

const adapter = (id: string, available: boolean): ModelAdapter => ({
  id,
  label: id,
  provider: 'mock',
  pricing: { inputPerMTok: 0, outputPerMTok: 0 },
  available,
  generate: () => Promise.reject(new Error('명령은 모델을 호출하지 않는다')),
});
const registry = createModelRegistry({
  adapters: [adapter('mock:default', true), adapter('mock:no-key', false)],
  defaultId: 'mock:default',
  indexingDefaultId: 'mock:default',
});
const deps = () => ({ prisma, registry });

const NOW = new Date('2026-09-13T03:00:00Z');

/** 워커가 6단계를 끝낸 Run. 기본은 승인 대기. */
async function finishedRun(status: RunStatus = RUN_STATUS.pendingApproval) {
  const attempts = await prisma.run.count({ where: { topicId } });
  return prisma.run.create({
    data: {
      topicId,
      attempt: attempts + 1,
      topicSlug: '무한-스크롤',
      topicTitle: '무한 스크롤',
      modelId: 'mock:default',
      status,
      finishedAt: status === RUN_STATUS.pendingApproval ? null : NOW,
      steps: {
        createMany: {
          data: STEP_ORDER.map((name, order) => ({ name, order, status: STEP_STATUS.succeeded })),
        },
      },
    },
  });
}

describe('approveRun', () => {
  test('승인 대기 Run을 done으로 끝낸다', async () => {
    const run = await finishedRun();

    const result = await approveRun(prisma, run.id, NOW);

    expect(result).toMatchObject({ ok: true, run: { id: run.id, status: RUN_STATUS.done } });
    const after = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(after.finishedAt).toEqual(NOW);
  });

  test.each([RUN_STATUS.running, RUN_STATUS.done, RUN_STATUS.failed, RUN_STATUS.revised])(
    '%s Run은 승인하지 못한다',
    async (status) => {
      const run = await finishedRun(status);

      expect(await approveRun(prisma, run.id)).toEqual({
        ok: false,
        code: 'NOT_PENDING_APPROVAL',
      });
      expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(status);
    },
  );

  test('없는 Run이면 RUN_NOT_FOUND', async () => {
    expect(await approveRun(prisma, 'no-such-run')).toEqual({ ok: false, code: 'RUN_NOT_FOUND' });
  });

  test('두 번 승인하면 두 번째는 거절된다', async () => {
    const run = await finishedRun();
    await approveRun(prisma, run.id);

    expect(await approveRun(prisma, run.id)).toEqual({ ok: false, code: 'NOT_PENDING_APPROVAL' });
  });
});

describe('reviseRun', () => {
  test('이 Run은 revised로 끝나고 새 Run이 시작 단계부터 queued로 생긴다', async () => {
    const run = await finishedRun();

    const result = await reviseRun(deps(), { runId: run.id, instruction: '도입부를 짧게' }, NOW);

    expect(result).toMatchObject({
      ok: true,
      previous: { id: run.id, status: RUN_STATUS.revised, finishedAt: NOW },
      run: { topicId, attempt: 2, status: RUN_STATUS.running, finishedAt: null },
      plan: { startStep: 'velog', carried: ['evidence'] },
    });
    if (!result.ok) return;

    const created = await prisma.run.findUniqueOrThrow({
      where: { id: result.run.id },
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    expect(created).toMatchObject({
      workerState: 'queued',
      instruction: '도입부를 짧게',
      startStep: 'velog',
    });
    expect(created.steps[0]).toMatchObject({
      name: 'evidence',
      origin: STEP_ORIGIN.carried,
      status: STEP_STATUS.succeeded,
      sourceRunId: run.id,
    });
    expect(created.steps.slice(1).every((s) => s.status === STEP_STATUS.pending)).toBe(true);
  });

  test('단계 Select 지정이 지시 텍스트보다 우선한다', async () => {
    const run = await finishedRun();

    const result = await reviseRun(deps(), {
      runId: run.id,
      startStep: 'zenn',
      instruction: '커밋을 다시 봐',
    });

    expect(result).toMatchObject({ ok: true, plan: { startStep: 'zenn' } });
  });

  test('승인 대기가 아니면 거절하고 아무것도 만들지 않는다', async () => {
    const run = await finishedRun(RUN_STATUS.done);

    expect(await reviseRun(deps(), { runId: run.id, instruction: '' })).toEqual({
      ok: false,
      code: 'NOT_PENDING_APPROVAL',
    });
    expect(await prisma.run.count()).toBe(1);
  });

  test('revised된 Run에 다시 수정 지시하지 못한다 — 새 시도에서 해야 한다', async () => {
    const first = await finishedRun();
    const revised = await reviseRun(deps(), { runId: first.id, instruction: '' });
    if (!revised.ok) throw new Error(revised.code);

    expect(await reviseRun(deps(), { runId: first.id, instruction: '한 번 더' })).toEqual({
      ok: false,
      code: 'NOT_PENDING_APPROVAL',
    });
    expect(await prisma.run.count()).toBe(2);
  });

  test('새 Run을 못 만들면 이 Run도 승인 대기로 남는다(한 트랜잭션)', async () => {
    const run = await finishedRun();

    const result = await reviseRun(deps(), {
      runId: run.id,
      instruction: '',
      modelId: 'mock:no-key',
    });

    expect(result).toEqual({ ok: false, code: 'MODEL_UNAVAILABLE' });
    expect(await prisma.run.count()).toBe(1);
    expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).status).toBe(
      RUN_STATUS.pendingApproval,
    );
  });

  test('지시가 상한을 넘으면 DB를 보지 않고 거절한다', async () => {
    const run = await finishedRun();

    expect(
      await reviseRun(deps(), {
        runId: run.id,
        instruction: 'a'.repeat(INSTRUCTION_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, code: 'INSTRUCTION_TOO_LONG' });
    expect(await prisma.run.count()).toBe(1);
  });

  test('없는 Run이면 RUN_NOT_FOUND', async () => {
    expect(await reviseRun(deps(), { runId: 'no-such-run', instruction: '' })).toEqual({
      ok: false,
      code: 'RUN_NOT_FOUND',
    });
  });
});

describe('previewRerun', () => {
  test('다시 도는 단계와 carried 출처를 준다', async () => {
    const run = await finishedRun();

    const result = await previewRerun(prisma, { runId: run.id, instruction: '문장을 짧게' });

    expect(result).toEqual({
      ok: true,
      preview: {
        plan: { startStep: 'velog', fresh: STEP_ORDER.slice(1), carried: ['evidence'] },
        sources: { evidence: run.id },
      },
    });
  });

  test('같은 입력이면 미리보기와 실제 수정 지시의 fresh·carried·출처가 정확히 일치한다', async () => {
    // 두 번째 시도(verify부터)까지 만들어 두어 출처 승계가 걸리게 한다.
    const first = await finishedRun();
    const second = await reviseRun(deps(), {
      runId: first.id,
      startStep: 'verify',
      instruction: '',
    });
    if (!second.ok) throw new Error(second.code);
    await prisma.run.update({
      where: { id: second.run.id },
      data: { status: RUN_STATUS.pendingApproval },
    });
    await prisma.runStep.updateMany({
      where: { runId: second.run.id },
      data: { status: STEP_STATUS.succeeded },
    });

    const input = {
      runId: second.run.id,
      instruction: '링크드인 톤을 바꿔',
      startStep: 'linkedin' as const,
    };
    const preview = await previewRerun(prisma, input);
    const revised = await reviseRun(deps(), input);
    if (!preview.ok || !revised.ok) throw new Error('둘 다 성공해야 한다');

    expect(revised.plan).toEqual(preview.preview.plan);

    const steps = await prisma.runStep.findMany({
      where: { runId: revised.run.id },
      orderBy: { order: 'asc' },
    });
    const carried = steps.filter((s) => s.origin === STEP_ORIGIN.carried).map((s) => s.name);
    const fresh = steps.filter((s) => s.origin === STEP_ORIGIN.fresh).map((s) => s.name);
    expect(carried).toEqual([...preview.preview.plan.carried]);
    expect(fresh).toEqual([...preview.preview.plan.fresh]);
    expect(
      Object.fromEntries(
        steps.filter((s) => s.sourceRunId !== null).map((s) => [s.name, s.sourceRunId]),
      ),
    ).toEqual(preview.preview.sources);
    // 승계가 실제로 걸렸는지: evidence·velog는 첫 Run, verify는 두 번째 Run.
    expect(preview.preview.sources).toEqual({
      evidence: first.id,
      velog: first.id,
      verify: second.run.id,
    });
  });

  test('없는 Run·너무 긴 지시는 거절한다', async () => {
    const run = await finishedRun();

    expect(await previewRerun(prisma, { runId: 'no-such-run', instruction: '' })).toEqual({
      ok: false,
      code: 'RUN_NOT_FOUND',
    });
    expect(
      await previewRerun(prisma, {
        runId: run.id,
        instruction: 'a'.repeat(INSTRUCTION_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, code: 'INSTRUCTION_TOO_LONG' });
  });
});
