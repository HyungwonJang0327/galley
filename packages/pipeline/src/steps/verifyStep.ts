// 근거 검증 단계(verify) — 벨로그 본문의 주장을 EvidenceBundle과 대조해 VerificationReport(`verification.json`)를 만든다.
// **본문은 바꾸지 않고, unsupported가 있어도 단계는 성공**한다(표시 조건 — decisions/evidence-collection.md "근거 검증").
// 숫자·경로·식별자는 정규식+문자열 대조(비용 0), "~다." 서술은 모델이 번들만 보고 판정한다(서술이 없으면 모델을 부르지 않는다).
// 판정 출력이 깨지거나 잘려도 실패가 아니다 — 서술을 전부 uncertain으로 두고 보고서 `judge`에 남긴다.
// 본문은 ArtifactStore(`sources.velog ?? runId`), 번들은 EvidenceStore(`sources.evidence ?? runId`)에서 읽는다.
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceBundle } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import {
  countClaims,
  extractMechanicalClaims,
  extractStatements,
  findVerbatimRuns,
  matchMechanicalClaims,
  splitBodyLines,
  type ClaimStatus,
  type VerificationClaim,
  type VerificationReport,
} from '../evidence/verification.ts';
import { VERIFY_LIMITS, type VerifyLimits } from '../evidence/verifyLimits.ts';
import { extractJson, isRecord } from '../index/analysisText.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { WRITING_LIMITS, type WritingLimits } from './limits.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { abortable, classifyModelError, renderEvidenceItems } from './writing.ts';

export interface VerifyStepDeps {
  store: EvidenceStore;
  artifacts: ArtifactStore;
  /** 레지스트리 조회(모델 id → 어댑터). 서술 판정에만 쓴다. */
  adapters: { get(id: string): ModelAdapter | undefined };
  limits?: VerifyLimits;
  /** 판정 프롬프트의 근거 조각 총 글자 상한(본문 단계와 같은 값). */
  writingLimits?: WritingLimits;
}

/** 산출물 이름 — posts/<슬러그>/verification.json(B3a). */
export const VERIFICATION_ARTIFACT = 'verification.json';

const JUDGE_SYSTEM = `당신은 기술 블로그 초안의 문장이 "근거 묶음"으로 뒷받침되는지 판정하는 검수자입니다.
- 근거 묶음(코드 조각·note·분석 글 요약)이 사실의 전부입니다. 상식·추측·일반적인 기술 지식으로 채우지 않습니다.
- 각 문장을 supported / unsupported / uncertain 중 하나로 판정합니다.
  - supported: 문장의 사실(수치·시점·동작·결정·이유·사건)이 근거에 있다. 이름이 일반 이름으로 바뀐 것(예: 경로·식별자·회사명 토큰)은 사실이 같으면 supported로 봅니다.
  - unsupported: 근거와 어긋나거나, 구체적 사실(수치·시점·사건·이유)을 주장하는데 근거에 그 사실이 없다.
  - uncertain: 의견·소감·일반론이거나, 근거만으로는 참·거짓을 가릴 수 없다.
- 출력은 JSON 객체 하나뿐입니다: {"judgments":[{"id":1,"status":"supported","reason":"한 줄 사유"}, ...]}. 모든 id를 빠짐없이 포함하고, 앞뒤에 설명을 붙이지 않습니다.
`;

/** 판정 프롬프트 — 테스트·미리보기용으로 공개. 근거 묶음(조각·요약) + 번호 붙은 서술 문장. */
export function buildJudgePrompt(
  bundle: EvidenceBundle,
  statements: readonly VerificationClaim[],
  evidenceChars: number,
): { system: string; prompt: string } {
  const lines: string[] = [];
  const analyses = bundle.analyses ?? [];
  if (analyses.length > 0) {
    lines.push('# 근거 글 요약(인덱스)');
    for (const a of analyses) lines.push(`- [${a.kind}] ${a.title}: ${a.summary}`);
    lines.push('');
  }
  lines.push(
    `# 근거 묶음(${bundle.items.length}개 조각 — 이것이 사실의 전부)`,
    ...renderEvidenceItems(bundle.items, evidenceChars),
    `# 판정할 문장(${statements.length}개)`,
  );
  statements.forEach((s, i) => lines.push(`${i + 1}. ${s.text}`));
  lines.push('', '# 요청', '위 문장 각각을 근거 묶음만으로 판정해 JSON으로 답하세요.');
  return { system: JUDGE_SYSTEM, prompt: lines.join('\n') };
}

const STATUSES: readonly ClaimStatus[] = ['supported', 'unsupported', 'uncertain'];

/** 모델 출력 → id별 판정. 형식이 어긋나면 undefined(호출자가 전부 uncertain으로 둔다). */
export function parseJudgments(
  text: string,
): Map<number, { status: ClaimStatus; reason?: string }> | undefined {
  const json = extractJson(text);
  if (!isRecord(json) || !Array.isArray(json['judgments'])) return undefined;
  const out = new Map<number, { status: ClaimStatus; reason?: string }>();
  for (const j of json['judgments']) {
    if (!isRecord(j)) continue;
    const id = j['id'];
    const status = j['status'];
    if (!Number.isInteger(id) || typeof status !== 'string') continue;
    if (!(STATUSES as readonly string[]).includes(status)) continue;
    const reason = typeof j['reason'] === 'string' ? j['reason'].trim().slice(0, 200) : undefined;
    out.set(id as number, {
      status: status as ClaimStatus,
      ...(reason !== undefined && reason !== '' ? { reason } : {}),
    });
  }
  return out;
}

export function createVerifyStepRunner(deps: VerifyStepDeps): StepRunner {
  const limits = deps.limits ?? VERIFY_LIMITS;
  const evidenceChars = (deps.writingLimits ?? WRITING_LIMITS).evidenceChars;
  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'verify')
        throw new Error(`verify 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅(BS5) 오류`);
      ctx.signal.throwIfAborted();

      const adapter = deps.adapters.get(ctx.modelId);
      if (adapter === undefined)
        throw new StepFailure(
          'VERIFY_MODEL_UNKNOWN',
          '이 실행의 모델이 레지스트리에 없습니다.',
          false,
        );
      if (!adapter.available)
        throw new StepFailure('VERIFY_MODEL_UNAVAILABLE', '모델 API 키가 .env에 없습니다.', false);

      const velogRun = ctx.sources.velog ?? ctx.runId;
      const evidenceRun = ctx.sources.evidence ?? ctx.runId;
      const body = await deps.artifacts.read(ctx.topic.slug, velogRun, VELOG_ARTIFACT);
      if (!body.ok)
        throw body.code === 'ARTIFACT_MISSING'
          ? new StepFailure(
              'VERIFY_BODY_MISSING',
              '벨로그 본문이 없습니다. 벨로그 본문 단계부터 다시 실행하세요.',
              false,
            )
          : new StepFailure(
              'VERIFY_BODY_UNREADABLE',
              '벨로그 본문을 읽지 못했습니다(DATA_DIR 권한을 확인하세요).',
              false,
            );
      if (body.text.trim() === '')
        throw new StepFailure(
          'VERIFY_BODY_EMPTY',
          '벨로그 본문이 비어 있어 검증할 것이 없습니다. 벨로그 본문 단계부터 다시 실행하세요.',
          false,
        );
      const read = await deps.store.read(ctx.topic.slug, evidenceRun);
      if (!read.ok)
        throw new StepFailure(
          read.code === 'EVIDENCE_BUNDLE_MISSING'
            ? 'VERIFY_EVIDENCE_MISSING'
            : 'VERIFY_EVIDENCE_INVALID',
          read.code === 'EVIDENCE_BUNDLE_MISSING'
            ? '근거 묶음이 없습니다. 근거 수집 단계부터 다시 실행하세요.'
            : read.code === 'EVIDENCE_BUNDLE_UNREADABLE'
              ? '근거 묶음을 읽지 못했습니다(DATA_DIR 권한을 확인하세요).'
              : '근거 묶음 형식이 깨졌습니다. 근거 수집 단계부터 다시 실행하세요.',
          false,
        );
      const bundle = read.bundle;

      const lines = splitBodyLines(body.text);
      const mechanical = matchMechanicalClaims(extractMechanicalClaims(lines), bundle);
      const statements = extractStatements(lines, limits);
      const cleanRoom = findVerbatimRuns(lines, bundle, limits);
      ctx.signal.throwIfAborted();

      // 서술 판정 — 앞 maxStatements개만 모델에, 나머지는 uncertain(not-judged).
      let judge: VerificationReport['judge'] = { status: 'skipped' };
      let judged: VerificationClaim[] = statements.map((s) => ({ ...s, reason: 'not-judged' }));
      let generated: GenerateResult | undefined;
      if (statements.length > 0) {
        const head = statements.slice(0, limits.maxStatements);
        const { system, prompt } = buildJudgePrompt(bundle, head, evidenceChars);
        try {
          generated = await abortable(
            adapter.generate({ system, prompt, maxOutputTokens: limits.judgeMaxOutputTokens }),
            ctx.signal,
          );
        } catch (error) {
          if (ctx.signal.aborted) throw error;
          throw classifyModelError(error, 'VERIFY_JUDGE_FAILED');
        }
        const verdicts = generated.truncated ? undefined : parseJudgments(generated.text);
        judge = {
          status: generated.truncated
            ? 'truncated'
            : verdicts === undefined
              ? 'unparsed'
              : 'judged',
          model: adapter.id,
          statements: head.length,
        };
        judged = statements.map((s, i) => {
          if (i >= head.length) return { ...s, reason: 'not-judged' };
          const v = verdicts?.get(i + 1);
          if (v === undefined)
            return { ...s, status: 'uncertain', reason: `not-judged (${judge.status})` };
          return {
            ...s,
            status: v.status,
            ...(v.reason !== undefined ? { reason: v.reason } : {}),
          };
        });
      }

      const claims = [...mechanical, ...judged].sort((a, b) => a.line - b.line);
      const report: VerificationReport = {
        version: 1,
        runId: ctx.runId,
        topicSlug: ctx.topic.slug,
        verifiedAt: new Date().toISOString(),
        sources: { velog: velogRun, evidence: evidenceRun },
        claims,
        counts: countClaims(claims),
        cleanRoom: { threshold: limits.cleanRoomLines, matches: cleanRoom },
        judge,
      };
      const text = `${JSON.stringify(report, null, 2)}\n`;
      try {
        await deps.artifacts.write(ctx.topic.slug, ctx.runId, VERIFICATION_ARTIFACT, text);
      } catch (error) {
        throw new StepFailure(
          'VERIFY_STORE_WRITE_FAILED',
          '검증 보고서를 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }
      return {
        artifacts: { [VERIFICATION_ARTIFACT]: text },
        flags: { unsupported: report.counts.unsupported, uncertain: report.counts.uncertain },
        ...(generated === undefined
          ? {}
          : {
              tokens: { input: generated.usage.inputTokens, output: generated.usage.outputTokens },
              costUsd: generated.costUsd,
              model: adapter.id,
            }),
      };
    },
    async discard(ctx) {
      await deps.artifacts.remove(ctx.topic.slug, ctx.runId, VERIFICATION_ARTIFACT);
    },
  };
}
