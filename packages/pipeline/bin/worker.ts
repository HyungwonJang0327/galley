// 워커 프로세스. 책임은 **타이머·시그널·종료뿐**이다 — 무엇을 할지는 runOnce가 정한다.
// 실행: pnpm --filter @galley/pipeline worker
//
// 대시보드와는 DB로만 이야기한다(decisions/run-location.md). 신호를 주고받지 않는다.
// Node 24의 타입 스트리핑으로 그대로 돈다(빌드·런처 없음). **상대 import에 확장자가 필수**다
// — decisions/node-runtime.md, CLAUDE.md 함정 절.
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.ts';
import { defaultRedactConfigPath, loadRedactConfig } from '../src/evidence/redact.ts';
import { runIndexTick } from '../src/index/runIndexTick.ts';
import { runAutoLinkTick } from '../src/link/autoLink.ts';
import { createModelRegistryFromEnv } from '../src/model/ModelRegistry.ts';
import { createPrismaWorkerRepo } from '../src/worker/PrismaWorkerRepo.ts';
import { runOnce } from '../src/worker/runOnce.ts';
import { createMockStepRunner } from '../src/steps/MockStepRunner.ts';
import { createSeriesSource } from '../src/steps/seriesSource.ts';
import { LocalFsStorage } from '../src/storage/LocalFsStorage.ts';
import type { WorkerDeps } from '../src/worker/WorkerDeps.ts';

/** 할 일이 없을 때 쉬는 간격. 진행했으면 쉬지 않고 바로 다음 틱(decisions/run-location.md 폴링 2s). */
const IDLE_INTERVAL_MS = 2_000;

const ids = { next: () => randomUUID() };

const deps: WorkerDeps = {
  // 프로세스 하나에 하나. 재기동하면 새 id라 옛 클레임은 heartbeat 공백으로 회수된다.
  workerId: ids.next(),
  clock: { now: () => new Date() },
  ids,
  timers: {
    every: (ms, fn) => {
      const timer = setInterval(fn, ms);
      return () => clearInterval(timer);
    },
    after: (ms, fn) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    },
  },
  logger: {
    info: (message, data) => console.log(JSON.stringify({ level: 'info', message, ...data })),
    error: (message, data) => console.error(JSON.stringify({ level: 'error', message, ...data })),
  },
  repo: createPrismaWorkerRepo(prisma),
  // TODO(BE8~BE11): 단계별 실제 StepRunner로 교체. 그때까지는 결정적 Mock이 돈다.
  stepRunner: createMockStepRunner(),
  // 시리즈 편 정보(모든 단계 시작에 한 번) — 큐 파일(BLOG_DIR)을 읽기만 한다. BLOG_DIR이 없으면 시리즈 편만 실패한다.
  series: createSeriesSource({
    ...(process.env.BLOG_DIR ? { storage: new LocalFsStorage(process.env.BLOG_DIR) } : {}),
    prisma,
  }),
};

/**
 * 리포 인덱싱(IndexJob) — Run이 없을 때 runOnce가 이 틱을 부른다. 모델은 레지스트리(id → 어댑터)만, 식별 정보 필터는
 * 기동 시 한 번 읽는다. **없으면(MISSING)** null로 기동(readOnly 리포 작업은 인덱서가 REDACT_CONFIG_REQUIRED로 실패시킨다),
 * **깨졌으면(INVALID·UNREADABLE)** 기동하지 않는다 — BE2 결정 "깨진 설정이면 무조건 거부"(decisions/evidence-collection.md).
 * 조립 루트(bin)만 레지스트리를 import한다 — runOnce·runIndexTick은 어댑터 조회 인터페이스만 받는다.
 */
async function createIndexer(): Promise<NonNullable<WorkerDeps['indexer']> | null> {
  const registry = createModelRegistryFromEnv(process.env);
  const redactPath = defaultRedactConfigPath(process.env);
  const loaded = await loadRedactConfig(redactPath);
  if (!loaded.ok && loaded.code !== 'REDACT_CONFIG_MISSING') {
    deps.logger.error('식별 정보 필터 설정이 깨져 기동하지 않는다', { code: loaded.code });
    return null;
  }
  if (!loaded.ok)
    deps.logger.info('식별 정보 필터 설정 없이 기동한다(readOnly 리포 인덱싱은 거부된다)', {
      code: loaded.code,
    });
  const tickDeps = {
    prisma,
    workerId: deps.workerId,
    clock: deps.clock,
    timers: deps.timers,
    logger: deps.logger,
    adapters: registry,
    redactConfig: loaded.ok ? loaded.config : null,
  };
  return { tick: (signal) => runIndexTick(tickDeps, signal) };
}

const controller = new AbortController();
let stopping = false;

/**
 * SIGTERM/SIGINT: 진행 중 틱의 AbortSignal을 끊고, **그 틱이 끝나 클레임을 정리한 뒤** 종료한다.
 * 중간에 죽어도 heartbeat 공백으로 회수되지만, 정상 종료는 기다렸다 나가는 편이 빠르다.
 */
function stop(signal: string): void {
  if (stopping) return;
  stopping = true;
  deps.logger.info('종료 신호를 받았다', { signal });
  controller.abort(new Error(signal));
}

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    // 쉬는 중에 신호가 오면 곧바로 깬다.
    controller.signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

async function main(): Promise<void> {
  const indexer = await createIndexer();
  if (indexer === null) {
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  deps.indexer = indexer;
  // 주제 ↔ 분석 글 자동 연결 — Run·IndexJob이 없을 때 runOnce가 부른다(모델 없음, DB만).
  const linkDeps = { prisma, clock: deps.clock, logger: deps.logger };
  deps.linker = { tick: (signal) => runAutoLinkTick(linkDeps, signal) };
  deps.logger.info('워커 시작', { workerId: deps.workerId });

  while (!stopping) {
    try {
      const { outcome } = await runOnce(deps, controller.signal);
      if (stopping) break;
      // 진행했으면 바로 다음 틱 — 6단계를 2초씩 기다리면 실행이 하염없이 길어진다.
      // 자동 연결(linked)은 급하지 않은 가장 싼 일이라 쉰다 — 시계가 뒤로 가 stale 판정이 계속 참이어도 tight loop가 되지 않게.
      if (outcome === 'idle' || outcome === 'linked') await sleep(IDLE_INTERVAL_MS);
    } catch (error) {
      // 틱 하나가 실패해도 루프는 살아 있어야 한다(다음 틱이 다시 본다).
      deps.logger.error('틱 실패', {
        detail: error instanceof Error ? error.stack : String(error),
      });
      await sleep(IDLE_INTERVAL_MS);
    }
  }

  await prisma.$disconnect();
  deps.logger.info('워커 종료', { workerId: deps.workerId });
}

void main();
