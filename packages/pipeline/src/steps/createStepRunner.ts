// 단계명 → 구현 라우팅(BS5). 워커는 StepRunner 하나만 알고, 어느 단계가 모델을 부르고 어느 단계가 파일을 조립하는지는
// 여기 뒤에 있다(decisions/run-execution-model.md). 조립 루트(bin/worker.ts)가 스토어·어댑터·어투 폴더를 만들어 넘긴다.
import type { PrismaClient } from '@prisma/client';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { EvidenceLimits } from '../evidence/limits.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import type { VerifyLimits } from '../evidence/verifyLimits.ts';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { isStepName, type StepName } from '../run/stateMachine.ts';
import type { Clock } from '../worker/WorkerDeps.ts';
import { createEvidenceStepRunner } from './evidenceStep.ts';
import type { WritingLimits } from './limits.ts';
import { createLinkedinStepRunner } from './linkedinStep.ts';
import { createPublishInfoStepRunner } from './publishInfoStep.ts';
import type { StepContext, StepResult, StepRunner } from './StepRunner.ts';
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

/** 조립 루트용 — deps 하나로 6단계 러너를 만들어 라우팅한다. */
export function createStepRunner(deps: StepRunnerDeps): StepRunner {
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
    publishInfo:
      deps.publishInfo ??
      createPublishInfoStepRunner({
        store: deps.evidenceStore,
        artifacts: deps.artifactStore,
        adapters: deps.adapters,
        ...writingLimits,
      }),
  });
}
