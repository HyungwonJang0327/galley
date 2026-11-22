// 단계명 → 구현 라우팅(BS5). 워커는 StepRunner 하나만 알고, 어느 단계가 모델을 부르고 어느 단계가 파일을 조립하는지는
// 여기 뒤에 있다(decisions/run-execution-model.md). 조립 루트(bin/worker.ts)가 스토어·어댑터·어투 폴더를 만들어 넘긴다.
import type { PrismaClient } from '@prisma/client';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { EvidenceLimits } from '../evidence/limits.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import type { VerifyLimits } from '../evidence/verifyLimits.ts';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import type { IllustrationRenderer } from '../publish/illustration.ts';
import type { ThumbnailConfig, ThumbnailRenderer } from '../publish/thumbnail.ts';
import { isStepName, type StepName } from '../run/stateMachine.ts';
import type { Clock } from '../worker/WorkerDeps.ts';
import { createEvidenceStepRunner } from './evidenceStep.ts';
import { createIllustrationStepRunner } from './illustrationStep.ts';
import type { WritingLimits } from './limits.ts';
import { createLinkedinStepRunner } from './linkedinStep.ts';
import { createPublishInfoStepRunner } from './publishInfoStep.ts';
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import { redactStepContext } from './redactContext.ts';
import { createVelogStepRunner } from './velogStep.ts';
import { createVerifyStepRunner } from './verifyStep.ts';
import { createZennStepRunner } from './zennStep.ts';

export interface StepRunnerDeps {
  prisma: PrismaClient;
  /** 근거 번들(DATA_DIR/evidence) — 근거 수집이 쓰고 본문·검증이 읽는다. */
  evidenceStore: EvidenceStore;
  /** 단계 산출물(DATA_DIR/artifacts) — 본문이 쓰고 파생 단계가 읽는다. */
  artifactStore: ArtifactStore;
  /** 어투 프롬프트 폴더(절대경로, resolveTonePromptsDir). */
  promptsDir: string;
  /** 레지스트리 조회(모델 id → 어댑터). 러너는 레지스트리 전체를 모른다. */
  adapters: { get(id: string): ModelAdapter | undefined };
  /** 식별 정보 필터 — null이면 설정 없음(근거 수집이 readOnly 리포를 거부한다). */
  redactConfig: RedactConfig | null;
  clock: Clock;
  /** 썸네일 렌더러(발행정보 단계) + 템플릿 설정(.galley/thumbnail.json, 없으면 빈 푸터). */
  thumbnails: ThumbnailRenderer;
  thumbnailConfig?: ThumbnailConfig;
  /** 삽화 렌더러(삽화 단계) — 썸네일과 같은 설치된 Chrome. */
  illustrations: IllustrationRenderer;
  /** 발행정보 단계를 바꿔 끼울 자리(테스트용). 없으면 실제 러너(createPublishInfoStepRunner, B3a). */
  publishInfo?: StepRunner;
  limits?: { evidence?: EvidenceLimits; writing?: WritingLimits; verify?: VerifyLimits };
}

/**
 * 단계별 러너 표 → StepRunner 하나(순수). run·discard를 그 단계 러너에 넘긴다. 표에 없는 단계명은 프로그래머 오류다 —
 * 상태 머신의 STEP_ORDER와 표가 어긋난 것이라 값으로 돌려주지 않고 던진다.
 */
export function routeStepRunner(runners: Record<StepName, StepRunner>): StepRunner {
  const pick = (step: StepName): StepRunner => {
    // 표는 StepName 전부를 요구하지만, DB에서 온 문자열이 단계명이 아닐 수 있다(스키마에 enum 없음).
    if (!isStepName(step)) throw new Error(`단계 러너 라우팅: 모르는 단계명 ${String(step)}`);
    return runners[step];
  };
  return {
    // async — 모르는 단계명도 동기 throw가 아니라 거부로 나가 워커의 한 경로(await)로 잡힌다.
    async run(ctx: StepContext): Promise<StepResult> {
      return pick(ctx.step).run(ctx);
    },
    async discard(ctx) {
      await pick(ctx.step).discard?.(ctx);
    },
  };
}

/** 이전 결과를 고치는 길(`ctx.patch`)을 구현한 단계 — 구현될 때마다 여기에 더한다(decisions/review-questions.md 단위 ④⑤). */
const PATCH_STEPS: ReadonlySet<StepName> = new Set<StepName>();

/**
 * 조립 루트용 — deps 하나로 7단계 러너를 만들어 라우팅한다. 라우팅 전에 **식별 정보 필터를 제목 경로에 한 번** 건다
 * (`redactStepContext`, decisions/title-redact.md) — 단계 구현은 걸러진 제목만 본다. discard는 제목을 쓰지 않아 그대로.
 */
export function createStepRunner(deps: StepRunnerDeps): StepRunner {
  const routed = createRoutedStepRunner(deps);
  return {
    async run(ctx: StepContext): Promise<StepResult> {
      // 고치는 길이 없는 단계에 고침 입력이 오면 멈춘다 — 그대로 넘기면 그 단계가 처음부터 다시 만들어 답하지 않은 곳까지 바뀐다.
      if (ctx.patch !== undefined && !PATCH_STEPS.has(ctx.step))
        throw new StepFailure(
          'PATCH_UNSUPPORTED',
          '이 단계는 이전 결과를 고치는 방식을 아직 지원하지 않습니다.',
          false,
        );
      return routed.run(redactStepContext(ctx, deps.redactConfig).ctx);
    },
    async discard(ctx) {
      await routed.discard?.(ctx);
    },
  };
}

function createRoutedStepRunner(deps: StepRunnerDeps): StepRunner {
  const writing = {
    artifacts: deps.artifactStore,
    promptsDir: deps.promptsDir,
    adapters: deps.adapters,
  };
  const writingLimits = deps.limits?.writing === undefined ? {} : { limits: deps.limits.writing };
  return routeStepRunner({
    evidence: createEvidenceStepRunner({
      prisma: deps.prisma,
      store: deps.evidenceStore,
      redactConfig: deps.redactConfig,
      clock: deps.clock,
      ...(deps.limits?.evidence === undefined ? {} : { limits: deps.limits.evidence }),
    }),
    velog: createVelogStepRunner({ ...writing, store: deps.evidenceStore, ...writingLimits }),
    verify: createVerifyStepRunner({
      store: deps.evidenceStore,
      artifacts: deps.artifactStore,
      adapters: deps.adapters,
      clock: deps.clock,
      ...(deps.limits?.verify === undefined ? {} : { limits: deps.limits.verify }),
      ...(deps.limits?.writing === undefined ? {} : { writingLimits: deps.limits.writing }),
    }),
    linkedin: createLinkedinStepRunner({ ...writing, ...writingLimits }),
    zenn: createZennStepRunner({ ...writing, ...writingLimits }),
    illustration: createIllustrationStepRunner({
      artifacts: deps.artifactStore,
      adapters: deps.adapters,
      illustrations: deps.illustrations,
      ...writingLimits,
    }),
    publishInfo:
      deps.publishInfo ??
      createPublishInfoStepRunner({
        store: deps.evidenceStore,
        artifacts: deps.artifactStore,
        adapters: deps.adapters,
        thumbnails: deps.thumbnails,
        ...(deps.thumbnailConfig === undefined ? {} : { thumbnailConfig: deps.thumbnailConfig }),
        ...writingLimits,
      }),
  });
}
