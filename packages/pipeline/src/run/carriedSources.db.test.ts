// carried 출처 조회 통합 테스트: 재실행을 두 번 한 뒤에도 출처가 밀리지 않는지.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { resolveCarriedSources } from './carriedSources';
import { STEP_ORDER, STEP_ORIGIN, STEP_STATUS, planRerun, type StepName } from './stateMachine';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

let dbDir: string;
let prisma: PrismaClient;

beforeAll(async () => {
  dbDir = await mkdtemp(join(tmpdir(), 'galley-carried-db-'));
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
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dbDir, { recursive: true, force: true });
});

/**
 * Run 하나를 6단계와 함께 만든다. `carriedFrom`이 있으면 그 Run의 결과를 이어받은 재실행으로
 * 본다 — 워커(BE14c)가 할 일을 테스트가 손으로 흉내 낸다.
 */
async function createRun(options: {
  startStep?: StepName;
  carriedFrom?: { runId: string; sources: Map<StepName, string> };
}) {
  const plan = options.startStep
    ? planRerun({ startStep: options.startStep, instruction: '' })
    : { fresh: STEP_ORDER, carried: [] as readonly StepName[] };

  const run = await prisma.run.create({
    data: {
      topicSlug: '무한-스크롤',
      topicTitle: '무한 스크롤',
      modelId: 'mock',
      steps: {
        create: STEP_ORDER.map((name, order) => {
          const isCarried = plan.carried.includes(name);
          return {
            name,
            order,
            status: STEP_STATUS.succeeded,
            origin: isCarried ? STEP_ORIGIN.carried : STEP_ORIGIN.fresh,
            sourceRunId: isCarried ? (options.carriedFrom?.sources.get(name) ?? null) : null,
          };
        }),
      },
    },
  });
  return run.id;
}

describe('resolveCarriedSources', () => {
  test('직전 Run이 직접 생산했으면 직전 Run이 출처', async () => {
    const run1 = await createRun({});

    const sources = await resolveCarriedSources(prisma, run1, ['evidence', 'velog']);

    expect(sources.get('evidence')).toBe(run1);
    expect(sources.get('velog')).toBe(run1);
  });

  test('재실행을 반복해도 출처가 밀리지 않는다(승계)', async () => {
    // Run1: 첫 실행 — 6단계 전부 fresh.
    const run1 = await createRun({});

    // Run2: 본문부터 재실행 — evidence는 Run1에서 이어받는다.
    const forRun2 = await resolveCarriedSources(
      prisma,
      run1,
      planRerun({ startStep: 'velog', instruction: '' }).carried,
    );
    const run2 = await createRun({
      startStep: 'velog',
      carriedFrom: { runId: run1, sources: forRun2 },
    });

    // Run3: 발행정보만 재실행 — 앞 다섯이 전부 carried.
    const forRun3 = await resolveCarriedSources(
      prisma,
      run2,
      planRerun({ startStep: 'publishInfo', instruction: '' }).carried,
    );

    // evidence를 실제로 생산한 것은 Run2가 아니라 Run1이다.
    expect(forRun3.get('evidence')).toBe(run1);
    // 본문·검증은 Run2가 다시 돌렸으므로 Run2가 생산자.
    expect(forRun3.get('velog')).toBe(run2);
    expect(forRun3.get('verify')).toBe(run2);
  });

  test('빈 목록이면 조회하지 않는다', async () => {
    expect((await resolveCarriedSources(prisma, 'no-such-run', [])).size).toBe(0);
  });

  test('기록이 없는 단계는 Map에서 빠진다(없는 출처를 지어내지 않는다)', async () => {
    const run1 = await createRun({});
    await prisma.runStep.deleteMany({ where: { runId: run1, name: 'evidence' } });

    const sources = await resolveCarriedSources(prisma, run1, ['evidence', 'velog']);

    expect(sources.has('evidence')).toBe(false);
    expect(sources.get('velog')).toBe(run1);
  });
});
