import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import { STEP_ORDER, type StepName } from '../run/stateMachine.ts';
import { createStepRunner, routeStepRunner } from './createStepRunner.ts';
import type { StepContext, StepRunner } from './StepRunner.ts';

const ctx = (step: StepName, over: Partial<StepContext> = {}): StepContext => ({
  runId: 'run_1',
  step,
  topic: { id: 't1', title: '주제', slug: 'topic' },
  modelId: 'nope',
  sources: {},
  signal: new AbortController().signal,
  ...over,
});

describe('routeStepRunner', () => {
  const fake = (name: StepName): StepRunner & { runs: StepName[]; discards: StepName[] } => {
    const runner = {
      runs: [] as StepName[],
      discards: [] as StepName[],
      async run(c: StepContext) {
        runner.runs.push(c.step);
        return { artifacts: { [name]: 'x' } };
      },
      async discard(c: Pick<StepContext, 'step'>) {
        runner.discards.push(c.step);
      },
    };
    return runner;
  };

  test('단계명대로 그 러너의 run·discard를 부른다', async () => {
    const table = Object.fromEntries(STEP_ORDER.map((s) => [s, fake(s)])) as Record<
      StepName,
      ReturnType<typeof fake>
    >;
    const router = routeStepRunner(table);
    for (const step of STEP_ORDER) {
      expect(await router.run(ctx(step))).toEqual({ artifacts: { [step]: 'x' } });
      await router.discard?.(ctx(step));
    }
    for (const step of STEP_ORDER) {
      expect(table[step].runs).toEqual([step]);
      expect(table[step].discards).toEqual([step]);
    }
  });

  test('discard가 없는 러너는 조용히 넘어간다', async () => {
    const noDiscard: StepRunner = { run: async () => ({ artifacts: {} }) };
    const table = Object.fromEntries(STEP_ORDER.map((s) => [s, noDiscard])) as Record<
      StepName,
      StepRunner
    >;
    await expect(routeStepRunner(table).discard?.(ctx('velog'))).resolves.toBeUndefined();
  });

  test('모르는 단계명은 프로그래머 오류로 던진다(값이 아니라)', async () => {
    const table = Object.fromEntries(STEP_ORDER.map((s) => [s, fake(s)])) as Record<
      StepName,
      ReturnType<typeof fake>
    >;
    const router = routeStepRunner(table);
    const bogus = ctx('thumbnail' as StepName);
    await expect(router.run(bogus)).rejects.toThrow('모르는 단계명 thumbnail');
    await expect(router.discard?.(bogus)).rejects.toThrow('모르는 단계명 thumbnail');
  });
});

describe('createStepRunner', () => {
  let dir: string;
  let runner: StepRunner;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'galley-step-router-'));
    runner = createStepRunner({
      prisma: {} as unknown as PrismaClient,
      evidenceStore: new LocalFsEvidenceStore(join(dir, 'data')),
      artifactStore: new LocalFsArtifactStore(join(dir, 'data')),
      promptsDir: join(dir, 'prompts'),
      adapters: { get: () => undefined },
      redactConfig: null,
      clock: { now: () => new Date('2026-09-26T00:00:00Z') },
    });
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('모델 단계는 각자의 실패 코드로 — 라우팅이 그 단계 구현에 닿았다는 증거', async () => {
    // 어댑터가 없으니 모델 조회에서 그 단계 접두의 코드로 멈춘다(그 앞 단계 오류가 아니다).
    await expect(runner.run(ctx('velog'))).rejects.toMatchObject({ code: 'VELOG_MODEL_UNKNOWN' });
    await expect(runner.run(ctx('linkedin'))).rejects.toMatchObject({
      code: 'LINKEDIN_MODEL_UNKNOWN',
    });
    await expect(runner.run(ctx('zenn'))).rejects.toMatchObject({ code: 'ZENN_MODEL_UNKNOWN' });
  });

  test('발행정보는 실제 러너 — 모델이 없으면 그 단계 코드로 실패', async () => {
    await expect(runner.run(ctx('publishInfo'))).rejects.toMatchObject({
      code: 'PUBLISH_INFO_MODEL_UNKNOWN',
    });
  });

  test('publishInfo 러너를 넘기면 그것을 쓴다(B3a 교체 자리)', async () => {
    const custom = vi.fn(async () => ({ artifacts: { 'publish.md': 'custom' } }));
    const withCustom = createStepRunner({
      prisma: {} as unknown as PrismaClient,
      evidenceStore: new LocalFsEvidenceStore(join(dir, 'data')),
      artifactStore: new LocalFsArtifactStore(join(dir, 'data')),
      promptsDir: join(dir, 'prompts'),
      adapters: { get: () => undefined },
      redactConfig: null,
      clock: { now: () => new Date() },
      publishInfo: { run: custom },
    });
    expect(await withCustom.run(ctx('publishInfo'))).toEqual({
      artifacts: { 'publish.md': 'custom' },
    });
    expect(custom).toHaveBeenCalledTimes(1);
  });
});
