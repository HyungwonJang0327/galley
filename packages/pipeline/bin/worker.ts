// 워커 프로세스. 책임은 **타이머·시그널·종료뿐**이다 — 무엇을 할지는 runOnce가 정한다.
// 실행: pnpm --filter @galley/pipeline worker
//
// 대시보드와는 DB로만 이야기한다(decisions/run-location.md). 신호를 주고받지 않는다.
// Node 24의 타입 스트리핑으로 그대로 돈다(빌드·런처 없음). **상대 import에 확장자가 필수**다
// — decisions/node-runtime.md, CLAUDE.md 함정 절.
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db.ts';
import { createPrismaWorkerRepo } from '../src/worker/PrismaWorkerRepo.ts';
import { runOnce } from '../src/worker/runOnce.ts';
import { createMockStepRunner } from '../src/steps/MockStepRunner.ts';
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
};

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
  deps.logger.info('워커 시작', { workerId: deps.workerId });

  while (!stopping) {
    try {
      const { outcome } = await runOnce(deps, controller.signal);
      if (stopping) break;
      // 진행했으면 바로 다음 틱 — 6단계를 2초씩 기다리면 실행이 하염없이 길어진다.
      if (outcome === 'idle') await sleep(IDLE_INTERVAL_MS);
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
