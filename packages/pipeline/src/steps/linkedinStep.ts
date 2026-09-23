// 링크드인 요약 단계(linkedin) — 입력은 **벨로그 본문 + 어투 프롬프트 + 수정 지시**뿐이다. EvidenceBundle을 다시 넣지 않는다
// (본문에서 파생 — decisions/evidence-collection.md "링크드인·Zenn은 본문에서 파생"). 본문은 ArtifactStore(DATA_DIR)에서
// `sources.velog ?? runId`로 읽고(carried면 그 본문을 만든 Run의 것), 어투는 `.galley/prompts/linkedin.md`(BS1), 산출물은
// ArtifactStore에 직접 쓴다. 벨로그 링크 자리(`[벨로그 링크]`)는 어투 규칙이 정하고 코드는 모른다(발행 후 사람이 채운다).
// 모델은 ctx.modelId로 레지스트리에서 고른다(provider를 모른다 — decisions/model-selection.md).
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { loadTonePrompt, type TonePrompt } from '../prompts/tonePrompts.ts';
import { stripTopicHints } from '../queue/normalizeTitle.ts';
import { WRITING_LIMITS, type WritingLimits } from './limits.ts';
import {
  abortable,
  classifyModelError,
  fenceFor,
  tonePromptFailure,
  unwrapFence,
  VELOG_ARTIFACT,
} from './velogStep.ts';

export interface LinkedinStepDeps {
  /** 산출물 저장소(DATA_DIR) — 벨로그 본문을 여기서 읽고 linkedin.md를 여기에 쓴다. */
  artifacts: ArtifactStore;
  /** 어투 프롬프트 폴더(절대경로) — 조립 루트가 resolveTonePromptsDir로 정해 넘긴다. */
  promptsDir: string;
  /** 레지스트리 조회(모델 id → 어댑터). */
  adapters: { get(id: string): ModelAdapter | undefined };
  limits?: WritingLimits;
}

/** 링크드인 단계의 입력 전부 — 근거 번들·리포 경로·분석 글 자리가 없다(본문에서만 파생). */
export interface LinkedinInput {
  /** 제목은 괄호 힌트를 뗀 것만(벨로그 단계와 같은 규칙). */
  topic: { title: string; slug: string };
  /** 벨로그 본문(velog.md 전체). 사실의 전부. */
  body: string;
  tone: TonePrompt;
  instruction?: string;
}

/** 산출물 이름 — posts/<슬러그>/linkedin.md(B3a). */
export const LINKEDIN_ARTIFACT = 'linkedin.md';

const SYSTEM_PREFIX = `당신은 아래 "어투" 규칙대로 기술 블로그 글의 링크드인 게시글을 쓰는 작성자입니다.
- 사실(수치·시점·동작·결정과 그 이유·에피소드)은 오직 사용자 메시지의 "벨로그 본문"에 있는 것만 씁니다. 본문에 없는 사실은
  지어내지 말고, 본문에 있는 <!-- [확인 필요] ... --> 주석의 내용은 확정된 사실로 쓰지 않습니다.
- 본문의 코드·식별자·경로는 이미 일반 이름으로 바뀐 것이니 그대로 두고, 새 코드는 넣지 않습니다.
- 본문의 대괄호 치환 표기(예: [COMPANY], [EMAIL], [벨로그 링크] 같은 토큰)는 풀어 쓰지 말고 그대로 둡니다.
- 출력은 링크드인에 그대로 붙여 넣을 게시글 본문 하나이며, 전체를 코드 펜스로 감싸거나 앞뒤에 설명·제목 줄을 붙이지 않습니다.

`;

/** 모델에 보내는 프롬프트 — 테스트·미리보기용으로 공개. system = 어투, user = 주제·지시·벨로그 본문. */
export function buildLinkedinPrompt(input: LinkedinInput): { system: string; prompt: string } {
  const lines: string[] = [`# 주제`, stripTopicHints(input.topic.title), ''];
  if (input.instruction !== undefined && input.instruction.trim() !== '') {
    lines.push('# 수정 지시(재실행)', input.instruction.trim(), '');
  }
  const fence = fenceFor(input.body);
  lines.push(
    '# 벨로그 본문(이것이 사실의 전부)',
    fence,
    input.body.trimEnd(),
    fence,
    '',
    '# 요청',
    '위 어투 규칙대로 이 본문을 링크드인 게시글로 다시 쓰세요.',
  );
  return { system: SYSTEM_PREFIX + input.tone.text, prompt: lines.join('\n') };
}

export function createLinkedinStepRunner(deps: LinkedinStepDeps): StepRunner {
  const limits = deps.limits ?? WRITING_LIMITS;
  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'linkedin')
        throw new Error(`linkedin 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅(BS5) 오류`);
      ctx.signal.throwIfAborted();

      const adapter = deps.adapters.get(ctx.modelId);
      if (adapter === undefined)
        throw new StepFailure(
          'LINKEDIN_MODEL_UNKNOWN',
          '이 실행의 모델이 레지스트리에 없습니다.',
          false,
        );
      if (!adapter.available)
        throw new StepFailure(
          'LINKEDIN_MODEL_UNAVAILABLE',
          '모델 API 키가 .env에 없습니다.',
          false,
        );

      const tone = await loadTonePrompt(deps.promptsDir, 'linkedin');
      if (!tone.ok) throw tonePromptFailure(tone);

      // 본문: carried면 그 본문을 만든 Run의 것(sources.velog), 아니면 이 Run.
      const read = await deps.artifacts.read(
        ctx.topic.slug,
        ctx.sources.velog ?? ctx.runId,
        VELOG_ARTIFACT,
      );
      if (!read.ok)
        throw read.code === 'ARTIFACT_MISSING'
          ? new StepFailure(
              'LINKEDIN_BODY_MISSING',
              '벨로그 본문이 없습니다. 벨로그 본문 단계부터 다시 실행하세요.',
              false,
            )
          : new StepFailure(
              'LINKEDIN_BODY_UNREADABLE',
              '벨로그 본문을 읽지 못했습니다(DATA_DIR 권한을 확인하세요).',
              false,
            );
      const body = read.text.trim();
      if (body === '')
        throw new StepFailure(
          'LINKEDIN_BODY_EMPTY',
          '벨로그 본문이 비어 있어 링크드인 글을 쓰지 않습니다. 벨로그 본문 단계부터 다시 실행하세요.',
          false,
        );

      const { system, prompt } = buildLinkedinPrompt({
        topic: { title: ctx.topic.title, slug: ctx.topic.slug },
        body,
        tone: tone.value,
        ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
      });
      ctx.signal.throwIfAborted();
      let generated: GenerateResult;
      try {
        generated = await abortable(
          adapter.generate({ system, prompt, maxOutputTokens: limits.linkedinMaxOutputTokens }),
          ctx.signal,
        );
      } catch (error) {
        if (ctx.signal.aborted) throw error; // 워커가 끊은 것 — 실패가 아니라 중단
        throw classifyModelError(error, 'LINKEDIN_MODEL_FAILED');
      }
      if (generated.truncated)
        throw new StepFailure(
          'LINKEDIN_OUTPUT_TRUNCATED',
          '링크드인 글이 출력 상한에서 잘렸습니다. 어투의 분량 규칙을 확인하거나 출력 상한을 올리세요.',
          false,
        );
      const text = unwrapFence(generated.text.trim()).trim();
      if (text === '')
        throw new StepFailure('LINKEDIN_OUTPUT_EMPTY', '모델이 빈 글을 돌려줬습니다.', true);
      const post = `${text}\n`;
      try {
        await deps.artifacts.write(ctx.topic.slug, ctx.runId, LINKEDIN_ARTIFACT, post);
      } catch (error) {
        throw new StepFailure(
          'LINKEDIN_STORE_WRITE_FAILED',
          '링크드인 글을 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }
      return {
        artifacts: { [LINKEDIN_ARTIFACT]: post },
        tokens: { input: generated.usage.inputTokens, output: generated.usage.outputTokens },
        costUsd: generated.costUsd,
        model: adapter.id,
        promptHash: tone.value.hash,
      };
    },
    async discard(ctx) {
      await deps.artifacts.remove(ctx.topic.slug, ctx.runId, LINKEDIN_ARTIFACT);
    },
  };
}
