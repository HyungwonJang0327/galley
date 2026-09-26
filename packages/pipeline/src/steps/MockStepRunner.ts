// 토큰 없이 워커를 돌리기 위한 StepRunner. 실행은 월 1~2회 상위 모델이라 비싸서, 워커의 어려운
// 부분(클레임·순서·heartbeat·재시도·비용 기록)은 이걸로 CI에서 반복 검증한다.
// 단계마다 **결정적인** 산출물을 돌려준다 — 같은 입력이면 같은 결과여야 diff가 의미 있다.
// `stores`를 주면 실제 단계와 같은 파일을 DATA_DIR에 쓴다(B3a 리뷰 M4, 2026-09-27): development 조합에서 승인·타임라인
// 미리보기까지 토큰 없이 확인하기 위해서다. 형식은 실제 단계의 렌더러(발행정보·Zenn frontmatter)를 그대로 써서 승인이
// 읽는 것과 어긋나지 않는다. 안 주면 예전처럼 내용만 돌려준다(워커 단위 테스트). (decisions/run-execution-model.md §2)
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import { stripSnippets, type EvidenceBundle } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { VerificationClaim, VerificationReport } from '../evidence/verification.ts';
import { VERIFY_LIMITS } from '../evidence/verifyLimits.ts';
import { postFileNames } from '../publish/postFiles.ts';
import { STEP_ORDER, type StepName } from '../run/stateMachine.ts';
import { hashPromptText, isTonePromptStep } from '../prompts/tonePrompts.ts';
import type { Clock } from '../worker/WorkerDeps.ts';
import { renderPublishInfo } from './publishInfo.ts';
import { THUMBNAIL_ARTIFACT } from './publishInfoStep.ts';
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import { renderZennArticle } from './zennStep.ts';

/** 단계별 산출물 파일 이름 — 실제 단계와 같은 이름(승인·미리보기가 이 이름으로 읽는다). */
const ARTIFACT_NAME: Record<StepName, string> = {
  evidence: 'evidence.json',
  velog: 'velog.md',
  verify: 'verification.json',
  linkedin: 'linkedin.md',
  zenn: 'zenn.md',
  publishInfo: 'publish.md',
};

/** 1×1 투명 PNG — 썸네일 자리(승인은 바이트를 복사만 한다, 미리보기는 <img>로 보인다). */
const MOCK_THUMBNAIL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export interface MockStepRunnerOptions {
  /** 이 단계에서 실패하게 만든다(워커의 재시도·실패 경로 테스트용). */
  failAt?: { step: StepName; code: string; message?: string; retryable?: boolean };
  /** `failAt`이 이 횟수만큼만 실패하고 그 뒤엔 성공한다(재시도 성공 경로). */
  failTimes?: number;
  /** 근거 검증 줄에 띄울 표시용 플래그. 전이에는 영향이 없다. 파일을 쓰면 리포트의 counts·claims도 이 수를 따른다. */
  verifyFlags?: { unsupported: number; uncertain: number };
  /** 워커가 단계를 반환하며 산출물을 버리라고 할 때 불린다(테스트가 호출을 본다). */
  onDiscard?: (ctx: { runId: string; step: StepName }) => void;
  /** 주면 실제 단계와 같은 파일을 DATA_DIR에 쓴다(승인·미리보기 가능). 없으면 내용만 돌려준다. */
  stores?: { artifacts: ArtifactStore; evidence: EvidenceStore };
  /** 번들·리포트의 시각. 없으면 시스템 시계(파일 내용이 시각만 달라진다). */
  clock?: Clock;
}

/** 근거 번들 픽스처 — 가짜 커밋·경로·조각(회사 코드가 아니다). `filtered: true`라 미리보기가 조각을 보여 준다. */
function mockBundle(ctx: StepContext, collectedAt: string): EvidenceBundle {
  return {
    version: 1,
    runId: ctx.runId,
    topicId: ctx.topic.id,
    topicSlug: ctx.topic.slug,
    collectedAt,
    items: [
      {
        analysisId: 'mock-analysis-1',
        commit: '0000000000000000000000000000000000000001',
        path: 'src/mock/feed.ts',
        lineRange: { start: 10, end: 14 },
        date: '2026-01-01T00:00:00.000Z',
        note: 'Mock 근거(연결) — 실제 리포 조각이 아니다',
        source: 'linked',
        redacted: false,
        truncated: false,
        snippet: [
          'export function loadNextPage(cursor: string) {',
          '  // mock: 피드 끝에 닿기 전에 다음 페이지를 요청한다',
          '  return fetchPage(cursor, { prefetch: true });',
          '}',
          '',
        ].join('\n'),
      },
      {
        commit: '0000000000000000000000000000000000000002',
        path: 'src/mock/api.ts',
        lineRange: { start: 1, end: 3 },
        date: '2026-02-01T00:00:00.000Z',
        source: 'discovered',
        redacted: false,
        truncated: false,
        snippet: ['// mock: 탐색으로 들어온 근거', 'export const PAGE_SIZE = 20;', ''].join('\n'),
      },
    ],
    analyses: [
      { id: 'mock-analysis-1', kind: 'area', title: 'Mock 분석 글', summary: 'Mock 요약.' },
    ],
    unreadable: 0,
    filtered: true,
  };
}

/** 검증 리포트 픽스처 — flags 수만큼 근거 없음·불확실 주장, 나머지는 근거 있음 하나. */
function mockReport(
  ctx: StepContext,
  verifiedAt: string,
  flags: { unsupported: number; uncertain: number },
): VerificationReport {
  const bundle = mockBundle(ctx, verifiedAt);
  const ref = {
    commit: bundle.items[0]!.commit,
    path: bundle.items[0]!.path,
    lineRange: bundle.items[0]!.lineRange,
  };
  const claims: VerificationClaim[] = [
    {
      text: '20',
      kind: 'number',
      status: 'supported',
      line: 3,
      evidenceRef: ref,
      reason: 'in-analysis-summary',
    },
  ];
  for (let i = 0; i < flags.unsupported; i += 1)
    claims.push({
      text: `근거 없는 수치 ${i + 1}`,
      kind: 'number',
      status: 'unsupported',
      line: 10 + i,
      reason: 'not-in-evidence',
    });
  for (let i = 0; i < flags.uncertain; i += 1)
    claims.push({
      text: `불확실한 서술 ${i + 1}`,
      kind: 'statement',
      status: 'uncertain',
      line: 30 + i,
      reason: 'not-judged',
    });
  return {
    version: 1,
    runId: ctx.runId,
    topicSlug: ctx.topic.slug,
    verifiedAt,
    sources: { velog: ctx.sources.velog ?? ctx.runId, evidence: ctx.sources.evidence ?? ctx.runId },
    claims,
    counts: { supported: 1, unsupported: flags.unsupported, uncertain: flags.uncertain },
    cleanRoom: { threshold: VERIFY_LIMITS.cleanRoomLines, matches: [] },
    judge: { status: 'skipped' },
  };
}

/** 본문 픽스처 — 첫 줄 `# 제목`(벨로그·Zenn 단계 규칙), 수정 지시가 있으면 본문에 남긴다(재실행 diff). */
function mockBody(ctx: StepContext): string {
  return [
    `# ${ctx.topic.title}`,
    '',
    `단계: ${ctx.step}`,
    ctx.instruction !== undefined ? `수정 지시: ${ctx.instruction}` : null,
    '',
    'Mock 본문입니다. 페이지 크기는 20이고, 피드 끝에 닿기 전에 다음 페이지를 미리 불러옵니다.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/** 단계별 텍스트 산출물(파일 이름 → 내용). 근거 수집은 포인터 사본(posts 쪽 형식), 실제 번들은 EvidenceStore에. */
function mockArtifacts(
  ctx: StepContext,
  at: string,
  flags: { unsupported: number; uncertain: number },
): Record<string, string> {
  switch (ctx.step) {
    case 'evidence':
      return {
        [ARTIFACT_NAME.evidence]: JSON.stringify(stripSnippets(mockBundle(ctx, at)), null, 2),
      };
    case 'verify':
      return { [ARTIFACT_NAME.verify]: JSON.stringify(mockReport(ctx, at, flags), null, 2) };
    case 'zenn':
      return { [ARTIFACT_NAME.zenn]: renderZennArticle(ctx.topic.title, mockBody(ctx)) };
    case 'publishInfo':
      return {
        [ARTIFACT_NAME.publishInfo]: renderPublishInfo({
          title: ctx.topic.title,
          slug: ctx.topic.slug,
          intro: 'Mock 소개 — 실제 모델이 쓴 소개가 아닙니다.',
          tags: ['mock'],
          zenn: { title: ctx.topic.title, emoji: '📝', type: 'tech', topics: [] },
          evidence: stripSnippets(mockBundle(ctx, at)),
          thumbnailFile: postFileNames(ctx.topic.title).thumbnail,
          ...(ctx.series === undefined ? {} : { series: ctx.series }),
        }),
      };
    default:
      return { [ARTIFACT_NAME[ctx.step]]: mockBody(ctx) };
  }
}

/**
 * 결정적 Mock. 단계마다 고정 텍스트를 만들고 토큰·비용은 글자 수에서 어림한다
 * (모델이 없는 단계는 비운다 — 워커가 추정하지 않는다는 규칙을 Mock도 지킨다).
 */
export function createMockStepRunner(options: MockStepRunnerOptions = {}): StepRunner {
  let failures = 0;
  const flags = options.verifyFlags ?? { unsupported: 0, uncertain: 0 };
  const now = () => (options.clock ?? { now: () => new Date() }).now().toISOString();

  return {
    async run(ctx: StepContext): Promise<StepResult> {
      ctx.signal.throwIfAborted();

      const fail = options.failAt;
      if (fail !== undefined && fail.step === ctx.step) {
        const limit = options.failTimes ?? Number.POSITIVE_INFINITY;
        if (failures < limit) {
          failures += 1;
          throw new StepFailure(
            fail.code,
            fail.message ?? `${ctx.step} 단계 실패`,
            fail.retryable ?? false,
          );
        }
      }

      const at = now();
      const artifacts = mockArtifacts(ctx, at, flags);
      const result: StepResult = { artifacts };

      if (options.stores !== undefined) {
        const { artifacts: files, evidence } = options.stores;
        const slug = ctx.topic.slug;
        if (ctx.step === 'evidence') await evidence.write(mockBundle(ctx, at));
        else
          for (const [name, text] of Object.entries(artifacts))
            await files.write(slug, ctx.runId, name, text);
        if (ctx.step === 'publishInfo')
          await files.writeBytes(slug, ctx.runId, THUMBNAIL_ARTIFACT, MOCK_THUMBNAIL_PNG);
      }

      // 썸네일이 없는 대신 publishInfo를 모델 없는 단계로 둔다 — 모델 없는 경로도 워커가 겪게.
      if (ctx.step !== 'publishInfo') {
        const body = Object.values(artifacts)[0] ?? '';
        result.tokens = { input: body.length, output: body.length * 2 };
        result.costUsd = 0;
        result.model = 'mock';
      }
      if (ctx.step === 'verify' && options.verifyFlags !== undefined) {
        result.flags = options.verifyFlags;
      }
      // 어투 단계는 실제 구현처럼 promptHash를 돌려준다(결정적 — 파일 대신 고정 문자열의 해시). 워커가 기록하는 경로를 겪게.
      if (isTonePromptStep(ctx.step)) result.promptHash = hashPromptText(`mock-tone:${ctx.step}`);
      return result;
    },
    async discard(ctx) {
      options.onDiscard?.({ runId: ctx.runId, step: ctx.step });
      if (options.stores === undefined) return;
      const { artifacts: files, evidence } = options.stores;
      if (ctx.step === 'evidence') await evidence.remove(ctx.topic.slug, ctx.runId);
      else await files.remove(ctx.topic.slug, ctx.runId, ARTIFACT_NAME[ctx.step]);
      if (ctx.step === 'publishInfo')
        await files.remove(ctx.topic.slug, ctx.runId, THUMBNAIL_ARTIFACT);
    },
  };
}

/** 순서 배열을 Mock이 함께 내보내 테스트가 STEP_ORDER를 다시 적지 않게. */
export const MOCK_STEPS = STEP_ORDER;
