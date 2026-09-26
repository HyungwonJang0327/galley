// 워커 프로세스. 책임은 **타이머·시그널·종료뿐**이다 — 무엇을 할지는 runOnce가 정한다.
// 실행: pnpm --filter @galley/pipeline worker
//
// 대시보드와는 DB로만 이야기한다(decisions/run-location.md). 신호를 주고받지 않는다.
// Node 24의 타입 스트리핑으로 그대로 돈다(빌드·런처 없음). **상대 import에 확장자가 필수**다
// — decisions/node-runtime.md, CLAUDE.md 함정 절.
//
// 조립 루트(bin)만 레지스트리·스토어를 만든다 — runOnce·runIndexTick·단계 러너는 인터페이스만 받는다.
import { randomUUID } from 'node:crypto';
import { LocalFsArtifactStore } from '../src/artifacts/ArtifactStore.ts';
import { prisma } from '../src/db.ts';
import { LocalFsEvidenceStore } from '../src/evidence/EvidenceStore.ts';
import {
  defaultRedactConfigPath,
  loadRedactConfig,
  type RedactConfig,
} from '../src/evidence/redact.ts';
import { runIndexTick } from '../src/index/runIndexTick.ts';
import { runAutoLinkTick } from '../src/link/autoLink.ts';
import { createModelRegistryFromEnv, type ModelRegistry } from '../src/model/ModelRegistry.ts';
import {
  ChromeThumbnailRenderer,
  defaultThumbnailConfigPath,
  findChrome,
  loadThumbnailConfig,
  type ThumbnailConfig,
} from '../src/publish/thumbnail.ts';
import { resolveTonePromptsDir } from '../src/prompts/tonePrompts.ts';
import { createStepRunner } from '../src/steps/createStepRunner.ts';
import { createMockStepRunner } from '../src/steps/MockStepRunner.ts';
import { createSeriesSource } from '../src/steps/seriesSource.ts';
import type { StepRunner } from '../src/steps/StepRunner.ts';
import { LocalFsStorage } from '../src/storage/LocalFsStorage.ts';
import { createPrismaWorkerRepo } from '../src/worker/PrismaWorkerRepo.ts';
import { resolveDataDir } from '../src/worker/resolveDataDir.ts';
import { runOnce } from '../src/worker/runOnce.ts';
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
  // 기동 검증 뒤 main이 바꿔 끼운다(아래 createStepRunnerForEnv). 그 전엔 돌지 않는다.
  stepRunner: createMockStepRunner(),
  // 시리즈 편 정보(모든 단계 시작에 한 번) — 큐 파일(BLOG_DIR)을 읽기만 한다. BLOG_DIR이 없으면 시리즈 편만 실패한다.
  series: createSeriesSource({
    ...(process.env.BLOG_DIR ? { storage: new LocalFsStorage(process.env.BLOG_DIR) } : {}),
    prisma,
  }),
};

/**
 * 단계 러너를 Mock으로 돌리는 환경 — `NODE_ENV`가 `test`(스모크·CI) 또는 `development`(모델 없이 화면 확인). 실모델로
 * 돌릴 때는 `NODE_ENV` 없이(`pnpm worker`). Mock 어댑터가 development에만 있는 것과 같은 축이다
 * (decisions/model-selection.md, 2026-09-26 사용자 결정 BS5).
 */
function usesMockSteps(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'test' || env.NODE_ENV === 'development';
}

/**
 * 식별 정보 필터는 기동 시 한 번 읽어 인덱서·근거 수집이 같이 쓴다. **없으면(MISSING)** null로 기동(readOnly 리포 작업은
 * REDACT_CONFIG_REQUIRED로 실패한다), **깨졌으면(INVALID·UNREADABLE)** 기동하지 않는다 — BE2 결정 "깨진 설정이면
 * 무조건 거부"(decisions/evidence-collection.md).
 */
async function loadRedact(): Promise<{ ok: true; config: RedactConfig | null } | { ok: false }> {
  const loaded = await loadRedactConfig(defaultRedactConfigPath(process.env));
  if (loaded.ok) return { ok: true, config: loaded.config };
  if (loaded.code !== 'REDACT_CONFIG_MISSING') {
    deps.logger.error('식별 정보 필터 설정이 깨져 기동하지 않는다', { code: loaded.code });
    return { ok: false };
  }
  deps.logger.info('식별 정보 필터 설정 없이 기동한다(readOnly 리포 인덱싱·근거 수집은 거부된다)', {
    code: loaded.code,
  });
  return { ok: true, config: null };
}

/**
 * 실제 단계 러너 조립. DATA_DIR(코드 조각·산출물)·PROMPTS_DIR(어투)이 규칙에 맞지 않으면 기동하지 않는다 — 어디에 쓰는지
 * 모르는 채 돌지 않는다(BE8 ⑩·BS1 리뷰 3).
 */
/**
 * 썸네일 템플릿 설정 — **없으면** 기본(빈 푸터)으로 기동, **깨졌으면** 기동하지 않는다(redact와 같은 규칙). Chrome은 기동 조건이
 * 아니다 — 없으면 발행정보 단계가 THUMBNAIL_CHROME_NOT_FOUND로 실패하고 로그에 미리 알린다.
 */
async function loadThumbnail(): Promise<
  { ok: true; config: ThumbnailConfig | null } | { ok: false }
> {
  const loaded = await loadThumbnailConfig(defaultThumbnailConfigPath(process.env));
  if (loaded.ok) return { ok: true, config: loaded.config };
  if (loaded.code !== 'THUMBNAIL_CONFIG_MISSING') {
    deps.logger.error('썸네일 설정(.galley/thumbnail.json)이 깨져 기동하지 않는다', {
      code: loaded.code,
    });
    return { ok: false };
  }
  return { ok: true, config: null };
}

async function createStepRunnerForEnv(
  registry: ModelRegistry,
  redactConfig: RedactConfig | null,
  thumbnailConfig: ThumbnailConfig | null,
): Promise<StepRunner | null> {
  if (usesMockSteps(process.env)) {
    deps.logger.info('단계 러너: Mock', { NODE_ENV: process.env.NODE_ENV });
    return createMockStepRunner();
  }
  const dataDir = resolveDataDir(process.env);
  if (!dataDir.ok) {
    deps.logger.error('DATA_DIR이 규칙에 맞지 않아 기동하지 않는다', {
      code: dataDir.code,
      value: dataDir.value,
      hint: '루트 .env에 DATA_DIR을 절대경로로, BLOG_DIR 밖에 둔다(`~` 불가 — 셸이 아니라 확장되지 않는다)',
    });
    return null;
  }
  const prompts = resolveTonePromptsDir(process.env);
  if (!prompts.ok) {
    deps.logger.error('PROMPTS_DIR이 절대경로가 아니라 기동하지 않는다', {
      code: prompts.code,
      value: prompts.value,
    });
    return null;
  }
  // 어떤 모델로 돌 수 있는지 기동 로그에서 바로 보이게 — 키가 빠진 채 띄우면 Run은 MODEL_UNAVAILABLE로만 실패한다.
  const availableModels = registry
    .list()
    .filter((adapter) => adapter.available)
    .map((adapter) => adapter.id);
  const thumbnails = new ChromeThumbnailRenderer({ env: process.env });
  const chrome = findChrome(process.env);
  // 못 찾았거나 GALLEY_CHROME이 없는 파일을 가리키면(오타) 기동은 하되 미리 알린다 — 단계에서 THUMBNAIL_CHROME_NOT_FOUND로 실패한다.
  if (!(await thumbnails.check()).ok)
    deps.logger.error(
      'Chrome을 찾지 못했다 — 발행정보 단계(썸네일)가 실패한다. .env GALLEY_CHROME에 실행 파일 경로를 적는다',
      { GALLEY_CHROME: process.env.GALLEY_CHROME ?? null, candidate: chrome ?? null },
    );
  deps.logger.info('단계 러너: 실제', {
    dataDir: dataDir.dir,
    promptsDir: prompts.dir,
    redact: redactConfig !== null,
    availableModels,
    chrome: chrome ?? null,
    thumbnailConfig: thumbnailConfig !== null,
  });
  return createStepRunner({
    prisma,
    evidenceStore: new LocalFsEvidenceStore(dataDir.dir),
    artifactStore: new LocalFsArtifactStore(dataDir.dir),
    promptsDir: prompts.dir,
    adapters: registry,
    redactConfig,
    clock: deps.clock,
    thumbnails,
    ...(thumbnailConfig === null ? {} : { thumbnailConfig }),
  });
}

/** 리포 인덱싱(IndexJob) — Run이 없을 때 runOnce가 이 틱을 부른다. 레지스트리·필터는 main이 만든 것을 같이 쓴다. */
function createIndexer(
  registry: ModelRegistry,
  redactConfig: RedactConfig | null,
): NonNullable<WorkerDeps['indexer']> {
  const tickDeps = {
    prisma,
    workerId: deps.workerId,
    clock: deps.clock,
    timers: deps.timers,
    logger: deps.logger,
    adapters: registry,
    redactConfig,
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
  const registry = createModelRegistryFromEnv(process.env);
  const redact = await loadRedact();
  const thumbnail = await loadThumbnail();
  const stepRunner =
    redact.ok && thumbnail.ok
      ? await createStepRunnerForEnv(registry, redact.config, thumbnail.config)
      : null;
  if (!redact.ok || !thumbnail.ok || stepRunner === null) {
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  deps.stepRunner = stepRunner;
  deps.indexer = createIndexer(registry, redact.config);
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
