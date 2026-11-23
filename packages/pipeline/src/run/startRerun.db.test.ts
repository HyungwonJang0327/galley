// 재실행 시작 통합 테스트: 실제 임시 SQLite에 새 Run + 단계 7행(carried/fresh)이 한 번에 생기는지,
// 거절할 때 아무것도 남지 않는지, 반복 재실행에서 출처가 밀리지 않는지.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { createModelRegistry } from '../model/ModelRegistry.ts';
import { startRerun } from './startRerun.ts';
import {
  RUN_STATUS,
  STEP_ORDER,
  STEP_ORIGIN,
  STEP_STATUS,
  planAnswerRerun,
  planRerun,
  type RunStatus,
  type StepName,
} from './stateMachine.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-start-rerun-db-'));
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
  generate: () => Promise.reject(new Error('재실행 시작은 모델을 호출하지 않는다')),
});

const registry = createModelRegistry({
  adapters: [
    adapter('mock:default', true),
    adapter('mock:other', true),
    adapter('mock:no-key', false),
  ],
  defaultId: 'mock:default',
  indexingDefaultId: 'mock:default',
});

const deps = () => ({ prisma, registry });

/**
 * 워커가 끝낸 Run을 손으로 만든다. `failedAt`이 있으면 그 단계는 failed, 그 뒤는 pending이고
 * Run은 failed다. 없으면 7단계 succeeded + 주어진 검수 상태.
 */
async function finishedRun(options: { status?: RunStatus; failedAt?: StepName } = {}) {
  const failedIndex = options.failedAt ? STEP_ORDER.indexOf(options.failedAt) : -1;
  const status = options.failedAt
    ? RUN_STATUS.failed
    : (options.status ?? RUN_STATUS.pendingApproval);
  const attempts = await prisma.run.count({ where: { topicId } });

  return prisma.run.create({
    data: {
      topicId,
      attempt: attempts + 1,
      topicSlug: '무한-스크롤',
      topicTitle: '무한 스크롤',
      modelId: 'mock:default',
      status,
      finishedAt: status === RUN_STATUS.pendingApproval ? null : new Date(),
      steps: {
        createMany: {
          data: STEP_ORDER.map((name, order) => ({
            name,
            order,
            status:
              failedIndex < 0 || order < failedIndex
                ? STEP_STATUS.succeeded
                : order === failedIndex
                  ? STEP_STATUS.failed
                  : STEP_STATUS.pending,
          })),
        },
      },
    },
  });
}

async function stepsOf(runId: string) {
  return prisma.runStep.findMany({ where: { runId }, orderBy: { order: 'asc' } });
}

describe('startRerun', () => {
  test('승인 대기 Run에서 본문부터: 앞은 carried+succeeded, 뒤는 pending+fresh, 지시·시작 단계를 적는다', async () => {
    const previous = await finishedRun();
    const plan = planRerun({ instruction: '도입부를 짧게' });

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan,
      instruction: '도입부를 짧게',
    });

    expect(result).toMatchObject({
      ok: true,
      run: { topicId, attempt: 2, topicSlug: '무한-스크롤', modelId: 'mock:default' },
    });
    if (!result.ok) return;

    const run = await prisma.run.findUniqueOrThrow({ where: { id: result.run.id } });
    expect(run).toMatchObject({
      instruction: '도입부를 짧게',
      startStep: 'velog',
      status: RUN_STATUS.running,
      workerState: 'queued',
      finishedAt: null,
    });

    const steps = await stepsOf(run.id);
    expect(steps.map((s) => s.name)).toEqual([...STEP_ORDER]);
    expect(steps[0]).toMatchObject({
      name: 'evidence',
      status: STEP_STATUS.succeeded,
      origin: STEP_ORIGIN.carried,
      sourceRunId: previous.id,
    });
    for (const step of steps.slice(1)) {
      expect(step).toMatchObject({
        status: STEP_STATUS.pending,
        origin: STEP_ORIGIN.fresh,
        sourceRunId: null,
      });
    }
  });

  test('답 반영 계획: 고치는 단계는 pending+patched+고칠 대상, 뒤 단계(삽화)도 carried, 지시 없이 질문·답을 적는다', async () => {
    const previous = await finishedRun();

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planAnswerRerun({ contentChanges: true }),
      reviewAnswers: '{"version":1,"items":[]}',
    });
    if (!result.ok) throw new Error(result.code);

    const run = await prisma.run.findUniqueOrThrow({ where: { id: result.run.id } });
    expect(run).toMatchObject({
      instruction: null,
      reviewAnswers: '{"version":1,"items":[]}',
      startStep: 'velog',
      workerState: 'queued',
    });
    const rows = (await stepsOf(run.id)).map((s) => [s.name, s.status, s.origin, s.sourceRunId]);
    expect(rows).toEqual([
      ['evidence', STEP_STATUS.succeeded, STEP_ORIGIN.carried, previous.id],
      ['velog', STEP_STATUS.pending, STEP_ORIGIN.patched, previous.id],
      ['verify', STEP_STATUS.pending, STEP_ORIGIN.fresh, null],
      ['linkedin', STEP_STATUS.pending, STEP_ORIGIN.patched, previous.id],
      ['zenn', STEP_STATUS.pending, STEP_ORIGIN.patched, previous.id],
      ['illustration', STEP_STATUS.succeeded, STEP_ORIGIN.carried, previous.id],
      ['publishInfo', STEP_STATUS.pending, STEP_ORIGIN.patched, previous.id],
    ]);
  });

  test('답 반영을 거듭해도 유지 단계의 출처는 실제 생산 Run, 고칠 대상은 직전에 고친 Run이다', async () => {
    const first = await finishedRun();
    const second = await startRerun(deps(), {
      previousRunId: first.id,
      plan: planAnswerRerun({ contentChanges: false }),
      reviewAnswers: '{}',
    });
    if (!second.ok) throw new Error(second.code);
    await prisma.runStep.updateMany({
      where: { runId: second.run.id },
      data: { status: STEP_STATUS.succeeded },
    });
    await prisma.run.update({
      where: { id: second.run.id },
      data: { status: RUN_STATUS.pendingApproval },
    });

    const third = await startRerun(deps(), {
      previousRunId: second.run.id,
      plan: planAnswerRerun({ contentChanges: false }),
      reviewAnswers: '{}',
    });
    if (!third.ok) throw new Error(third.code);

    const rows = new Map((await stepsOf(third.run.id)).map((s) => [s.name, s]));
    // 본문은 2차가 고친 것이 고칠 대상이고, 검증·발행정보는 1차가 만든 그대로다.
    expect(rows.get('velog')).toMatchObject({
      origin: STEP_ORIGIN.patched,
      sourceRunId: second.run.id,
    });
    expect(rows.get('verify')).toMatchObject({
      origin: STEP_ORIGIN.carried,
      sourceRunId: first.id,
    });
    expect(rows.get('publishInfo')).toMatchObject({
      origin: STEP_ORIGIN.carried,
      sourceRunId: first.id,
    });
  });

  test('고칠 단계가 직전 Run에서 성공하지 않았으면 거절한다', async () => {
    const previous = await finishedRun({ failedAt: 'zenn' });

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planAnswerRerun({ contentChanges: true }),
      reviewAnswers: '{}',
    });

    expect(result).toEqual({ ok: false, code: 'CARRIED_STEP_NOT_SUCCEEDED' });
    expect(await prisma.run.count()).toBe(1);
  });

  test('슬러그·제목은 직전 Run 것을 복사한다 — 큐 제목이 그새 바뀌어도 다시 계산하지 않는다', async () => {
    const previous = await finishedRun();
    await prisma.queueItem.update({
      where: { id: topicId },
      data: { title: '완전히 다른 제목 (spacehome)' },
    });

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planRerun({ instruction: '도입부를 짧게' }),
      instruction: '도입부를 짧게',
    });

    // 단계·승인·미리보기가 "현재 Run의 슬러그 + 출처 Run id"로 파일을 찾는다 — 사슬 안에서 슬러그가 갈리면 전부 깨진다
    // (decisions/topic-slug.md "따라오는 것").
    expect(result).toMatchObject({
      ok: true,
      run: { topicSlug: '무한-스크롤', topicTitle: '무한 스크롤' },
    });
  });

  test('직전 Run의 검수 상태는 건드리지 않는다(종결은 승인 게이트 배선의 몫)', async () => {
    const previous = await finishedRun();

    await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planRerun({ instruction: '' }),
      instruction: '',
    });

    const after = await prisma.run.findUniqueOrThrow({ where: { id: previous.id } });
    expect(after).toMatchObject({ status: RUN_STATUS.pendingApproval, finishedAt: null });
  });

  test('근거 수집부터면 carried가 없고 7단계 전부 pending+fresh다', async () => {
    const previous = await finishedRun();

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planRerun({ instruction: '커밋을 다시 봐' }),
      instruction: '커밋을 다시 봐',
    });
    if (!result.ok) throw new Error(result.code);

    const steps = await stepsOf(result.run.id);
    expect(steps.every((s) => s.status === STEP_STATUS.pending)).toBe(true);
    expect(steps.every((s) => s.origin === STEP_ORIGIN.fresh)).toBe(true);
    expect((await prisma.run.findUniqueOrThrow({ where: { id: result.run.id } })).startStep).toBe(
      'evidence',
    );
  });

  test('재실행을 거듭해도 carried 출처는 실제 생산 Run을 가리킨다(밀리지 않는다)', async () => {
    const first = await finishedRun();
    const second = await startRerun(deps(), {
      previousRunId: first.id,
      plan: planRerun({ startStep: 'verify', instruction: '' }),
      instruction: '',
    });
    if (!second.ok) throw new Error(second.code);
    // 두 번째 시도가 끝났다고 치고, 그걸 기준으로 세 번째를 만든다.
    await prisma.run.update({
      where: { id: second.run.id },
      data: { status: RUN_STATUS.pendingApproval },
    });
    await prisma.runStep.updateMany({
      where: { runId: second.run.id, origin: STEP_ORIGIN.fresh },
      data: { status: STEP_STATUS.succeeded },
    });

    const third = await startRerun(deps(), {
      previousRunId: second.run.id,
      plan: planRerun({ startStep: 'linkedin', instruction: '' }),
      instruction: '',
    });
    if (!third.ok) throw new Error(third.code);

    const steps = await stepsOf(third.run.id);
    const sourceOf = (name: StepName) => steps.find((s) => s.name === name)?.sourceRunId;
    // evidence·velog는 첫 Run이 만들었고 두 번째는 이어받기만 했다 → 첫 Run을 승계.
    expect(sourceOf('evidence')).toBe(first.id);
    expect(sourceOf('velog')).toBe(first.id);
    // verify는 두 번째 Run이 새로 돌았다.
    expect(sourceOf('verify')).toBe(second.run.id);
    expect(third.run.attempt).toBe(3);
  });

  test('실패한 Run은 실패 단계부터 다시 돌 수 있다', async () => {
    const previous = await finishedRun({ failedAt: 'verify' });

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planRerun({ startStep: 'verify', instruction: '' }),
      instruction: '',
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const steps = await stepsOf(result.run.id);
    expect(steps.slice(0, 2).every((s) => s.origin === STEP_ORIGIN.carried)).toBe(true);
    expect(steps.slice(2).every((s) => s.status === STEP_STATUS.pending)).toBe(true);
  });

  test('실패한 단계를 이어받으려 하면 거절하고 아무것도 만들지 않는다', async () => {
    const previous = await finishedRun({ failedAt: 'verify' });

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planRerun({ startStep: 'zenn', instruction: '' }),
      instruction: '',
    });

    expect(result).toEqual({ ok: false, code: 'CARRIED_STEP_NOT_SUCCEEDED' });
    expect(await prisma.run.count()).toBe(1);
  });

  test('직전 Run이 아직 실행 중이면 거절한다', async () => {
    const previous = await finishedRun({ status: RUN_STATUS.running });

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: planRerun({ instruction: '' }),
      instruction: '',
    });

    expect(result).toEqual({ ok: false, code: 'RUN_IN_PROGRESS' });
    expect(await prisma.run.count()).toBe(1);
  });

  test('최신 시도가 실행 중일 때 옛 Run에서 갈라지려 해도 최신 시도 가드에 걸린다', async () => {
    const done = await finishedRun({ status: RUN_STATUS.done });
    await finishedRun({ status: RUN_STATUS.running });

    const result = await startRerun(deps(), {
      previousRunId: done.id,
      plan: planRerun({ instruction: '' }),
      instruction: '',
    });

    expect(result).toEqual({ ok: false, code: 'NOT_LATEST_ATTEMPT' });
    expect(await prisma.run.count()).toBe(2);
  });

  test('없는 Run이면 거절한다', async () => {
    expect(
      await startRerun(deps(), {
        previousRunId: 'no-such-run',
        plan: planRerun({ instruction: '' }),
        instruction: '',
      }),
    ).toEqual({ ok: false, code: 'RUN_NOT_FOUND' });
    expect(await prisma.run.count()).toBe(0);
  });

  test('계획이 7단계를 순서대로 덮지 않으면 DB를 보지 않고 거절한다', async () => {
    const previous = await finishedRun();

    const result = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: { startStep: 'velog', fresh: ['velog', 'verify'], carried: ['evidence'] },
      instruction: '',
    });

    expect(result).toEqual({ ok: false, code: 'INVALID_PLAN' });
    expect(await prisma.run.count()).toBe(1);

    // 같은 단계가 두 묶음에 들어가 수만 맞는 계획도 거절한다.
    const duplicated = await startRerun(deps(), {
      previousRunId: previous.id,
      plan: {
        startStep: 'velog',
        carried: ['evidence', 'illustration', 'publishInfo'],
        patched: ['velog', 'linkedin', 'velog'],
        fresh: ['verify'],
      },
    });
    expect(duplicated).toEqual({ ok: false, code: 'INVALID_PLAN' });
  });

  test('모델을 주지 않으면 직전 Run의 모델을 잇고, 주면 그 모델로 만든다', async () => {
    const previous = await finishedRun();
    const plan = planRerun({ instruction: '' });

    const inherited = await startRerun(deps(), {
      previousRunId: previous.id,
      plan,
      instruction: '',
    });
    expect(inherited).toMatchObject({ ok: true, run: { modelId: 'mock:default' } });
    if (!inherited.ok) return;
    await prisma.run.update({
      where: { id: inherited.run.id },
      data: { status: RUN_STATUS.done, finishedAt: new Date() },
    });

    // 세 번째 시도는 최신(두 번째)에서 갈라진다.
    const chosen = await startRerun(deps(), {
      previousRunId: inherited.run.id,
      plan,
      instruction: '',
      modelId: 'mock:other',
    });
    expect(chosen).toMatchObject({ ok: true, run: { modelId: 'mock:other', attempt: 3 } });
  });

  test('최신 시도가 아닌 Run에서는 갈라지지 못한다', async () => {
    const first = await finishedRun({ status: RUN_STATUS.revised });
    await finishedRun({ status: RUN_STATUS.pendingApproval });

    const result = await startRerun(deps(), {
      previousRunId: first.id,
      plan: planRerun({ instruction: '' }),
      instruction: '',
    });

    expect(result).toEqual({ ok: false, code: 'NOT_LATEST_ATTEMPT' });
    expect(await prisma.run.count()).toBe(2);
  });

  describe('주제 가드 — 다시 돌려도 승인이 거절할 주제', () => {
    const rerun = (previousRunId: string) =>
      startRerun(deps(), { previousRunId, plan: planRerun({ instruction: '' }), instruction: '' });

    test('파일에서 줄이 사라진 주제(확인 대기)는 다시 돌리지 않는다', async () => {
      const run = await finishedRun();
      await prisma.queueItem.update({ where: { id: topicId }, data: { missingSince: new Date() } });

      expect(await rerun(run.id)).toEqual({ ok: false, code: 'TOPIC_MISSING_FROM_FILE' });
      expect(await prisma.run.count()).toBe(1);
    });

    test('완료 섹션으로 간 주제는 다시 돌리지 않는다', async () => {
      const run = await finishedRun();
      await prisma.queueItem.update({ where: { id: topicId }, data: { status: 'done' } });

      expect(await rerun(run.id)).toEqual({ ok: false, code: 'TOPIC_ALREADY_DONE' });
      expect(await prisma.run.count()).toBe(1);
    });

    test('줄이 돌아오면(표시가 지워지면) 다시 돌릴 수 있다', async () => {
      const run = await finishedRun();
      await prisma.queueItem.update({ where: { id: topicId }, data: { missingSince: new Date() } });
      await prisma.queueItem.update({ where: { id: topicId }, data: { missingSince: null } });

      expect((await rerun(run.id)).ok).toBe(true);
    });
  });

  test('API 키 없는 모델·모르는 모델이면 만들지 않는다', async () => {
    const previous = await finishedRun();
    const plan = planRerun({ instruction: '' });

    expect(
      await startRerun(deps(), {
        previousRunId: previous.id,
        plan,
        instruction: '',
        modelId: 'mock:no-key',
      }),
    ).toEqual({ ok: false, code: 'MODEL_UNAVAILABLE' });
    expect(
      await startRerun(deps(), {
        previousRunId: previous.id,
        plan,
        instruction: '',
        modelId: 'mock:없음',
      }),
    ).toEqual({ ok: false, code: 'UNKNOWN_MODEL' });
    expect(await prisma.run.count()).toBe(1);
  });
});
