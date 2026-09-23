// 벨로그 본문 단계(velog) — 첫 실제 모델 호출. 입력은 **주제 + EvidenceBundle + 어투 프롬프트 + 수정 지시**뿐이다.
// 리포 경로·분석 글 원문이 들어갈 자리가 입력 타입에 없다(BE11 규칙, CLAUDE.md §5 "요약만으로 본문을 쓰지 않는다").
// 번들은 EvidenceStore(DATA_DIR)에서 `sources.evidence ?? runId`로 읽고, 어투는 `.galley/prompts/velog.md`(BS1),
// 산출물은 ArtifactStore(DATA_DIR)에 직접 쓴다(워커는 artifacts를 저장하지 않는다). 모델은 ctx.modelId로 레지스트리에서
// 고른다(provider를 모른다 — decisions/model-selection.md).
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceBundle } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { loadTonePrompt, type TonePrompt } from '../prompts/tonePrompts.ts';
import { stripTopicHints } from '../queue/normalizeTitle.ts';
import { WRITING_LIMITS, type WritingLimits } from './limits.ts';
import {
  abortable,
  classifyModelError,
  renderEvidenceItems,
  tonePromptFailure,
  unwrapFence,
} from './writing.ts';

export interface VelogStepDeps {
  store: EvidenceStore;
  /** 산출물 저장소(DATA_DIR) — 뒤 단계가 sources.velog ?? runId로 읽는다. */
  artifacts: ArtifactStore;
  /** 어투 프롬프트 폴더(절대경로) — 조립 루트가 resolveTonePromptsDir로 정해 넘긴다. */
  promptsDir: string;
  /** 레지스트리 조회(모델 id → 어댑터). */
  adapters: { get(id: string): ModelAdapter | undefined };
  limits?: WritingLimits;
}

/** 본문 단계의 입력 전부 — 이 타입 밖의 것은 프롬프트에 들어갈 수 없다(리포 경로·분석 글 원문 자리 없음). */
export interface VelogInput {
  /** 제목은 괄호 힌트를 뗀 것만 프롬프트에 넣는다(힌트의 리포 별칭이 모델에 가지 않게). */
  topic: { title: string; slug: string };
  bundle: EvidenceBundle;
  tone: TonePrompt;
  instruction?: string;
}

/** 워커에 돌려주는 산출물 이름 — posts/<슬러그>/velog.md(B3a). */
export const VELOG_ARTIFACT = 'velog.md';

const SYSTEM_PREFIX = `당신은 아래 "어투" 규칙대로 기술 블로그 초안을 쓰는 작성자입니다.
- 사실(수치·시점·동작·결정과 그 이유·에피소드)은 오직 사용자 메시지의 "근거 묶음"에 있는 것만 씁니다. 근거에 없는 사실은 지어내지 말고,
  확실하지 않은 것은 <!-- [확인 필요] ... --> 주석으로 남깁니다.
- 코드·식별자·경로는 어투 규칙대로 일반 이름으로 바꿔 클린룸으로 다시 씁니다. 바꾸는 것은 이름뿐이고 새 사실을 만들지 않습니다.
- 근거 조각에 든 대괄호 치환 표기(예: [COMPANY], [EMAIL], [INTERNAL_URL] 같은 대문자 토큰)는 풀어 쓰지 말고 그대로 둡니다.
- 출력은 마크다운 본문 하나이며, 전체를 코드 펜스로 감싸거나 앞뒤에 설명을 붙이지 않습니다.

`;

/** 모델에 보내는 프롬프트 — 테스트·미리보기용으로 공개. system = 어투, user = 주제·지시·요약·근거. */
export function buildVelogPrompt(
  input: VelogInput,
  limits: WritingLimits = WRITING_LIMITS,
): { system: string; prompt: string } {
  const { bundle } = input;
  const lines: string[] = [`# 주제`, stripTopicHints(input.topic.title), ''];
  if (input.instruction !== undefined && input.instruction.trim() !== '') {
    lines.push('# 수정 지시(재실행)', input.instruction.trim(), '');
  }

  const analyses = bundle.analyses ?? [];
  if (analyses.length > 0) {
    lines.push('# 근거 글 요약(인덱스)');
    let used = 0;
    for (const a of analyses) {
      const full = `- [${a.kind}] ${a.title}: ${a.summary}`;
      if (used + full.length > limits.summaryChars) lines.push(`- [${a.kind}] ${a.title}`);
      else {
        lines.push(full);
        used += full.length;
      }
    }
    lines.push('');
  }

  lines.push(
    `# 근거 묶음(${bundle.items.length}개 조각 — 이것이 사실의 전부)`,
    ...renderEvidenceItems(bundle.items, limits.evidenceChars),
  );
  lines.push('# 요청', '위 어투 규칙과 근거로 벨로그 본문 초안을 마크다운으로 작성하세요.');
  return { system: SYSTEM_PREFIX + input.tone.text, prompt: lines.join('\n') };
}

export function createVelogStepRunner(deps: VelogStepDeps): StepRunner {
  const limits = deps.limits ?? WRITING_LIMITS;
  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'velog')
        throw new Error(`velog 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅(BS5) 오류`);
      ctx.signal.throwIfAborted();

      const adapter = deps.adapters.get(ctx.modelId);
      if (adapter === undefined)
        throw new StepFailure(
          'VELOG_MODEL_UNKNOWN',
          '이 실행의 모델이 레지스트리에 없습니다.',
          false,
        );
      if (!adapter.available)
        throw new StepFailure('VELOG_MODEL_UNAVAILABLE', '모델 API 키가 .env에 없습니다.', false);

      const tone = await loadTonePrompt(deps.promptsDir, 'velog');
      if (!tone.ok) throw tonePromptFailure(tone);

      // 번들: carried면 그 결과를 만든 Run의 것(sources.evidence), 아니면 이 Run.
      const read = await deps.store.read(ctx.topic.slug, ctx.sources.evidence ?? ctx.runId);
      if (!read.ok) {
        const message =
          read.code === 'EVIDENCE_BUNDLE_MISSING'
            ? '근거 묶음이 없습니다. 근거 수집 단계부터 다시 실행하세요.'
            : read.code === 'EVIDENCE_BUNDLE_UNREADABLE'
              ? '근거 묶음을 읽지 못했습니다(DATA_DIR 권한을 확인하세요).'
              : '근거 묶음 형식이 깨졌습니다. 근거 수집 단계부터 다시 실행하세요.';
        throw new StepFailure(
          read.code === 'EVIDENCE_BUNDLE_MISSING'
            ? 'VELOG_EVIDENCE_MISSING'
            : 'VELOG_EVIDENCE_INVALID',
          message,
          false,
        );
      }
      if (read.bundle.items.length === 0)
        throw new StepFailure(
          'VELOG_EVIDENCE_EMPTY',
          '근거 조각이 0개라 본문을 쓰지 않습니다. 주제에 분석 글을 연결하고 근거 수집부터 다시 실행하세요.',
          false,
        );

      const { system, prompt } = buildVelogPrompt(
        {
          topic: { title: ctx.topic.title, slug: ctx.topic.slug },
          bundle: read.bundle,
          tone: tone.value,
          ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
        },
        limits,
      );
      ctx.signal.throwIfAborted();
      let generated: GenerateResult;
      try {
        generated = await abortable(
          adapter.generate({ system, prompt, maxOutputTokens: limits.velogMaxOutputTokens }),
          ctx.signal,
        );
      } catch (error) {
        if (ctx.signal.aborted) throw error; // 워커가 끊은 것 — 실패가 아니라 중단(toStepFailure가 ABORTED로)
        throw classifyModelError(error, 'VELOG_MODEL_FAILED');
      }
      if (generated.truncated)
        throw new StepFailure(
          'VELOG_OUTPUT_TRUNCATED',
          '본문이 출력 상한에서 잘렸습니다. 근거를 줄이거나 출력 상한을 올리세요.',
          false,
        );
      const text = unwrapFence(generated.text.trim()).trim();
      if (text === '')
        throw new StepFailure('VELOG_OUTPUT_EMPTY', '모델이 빈 본문을 돌려줬습니다.', true);
      const body = `${text}\n`;
      try {
        await deps.artifacts.write(ctx.topic.slug, ctx.runId, VELOG_ARTIFACT, body);
      } catch (error) {
        throw new StepFailure(
          'VELOG_STORE_WRITE_FAILED',
          '본문을 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }
      return {
        artifacts: { [VELOG_ARTIFACT]: body },
        tokens: { input: generated.usage.inputTokens, output: generated.usage.outputTokens },
        costUsd: generated.costUsd,
        model: adapter.id,
        promptHash: tone.value.hash,
      };
    },
    async discard(ctx) {
      await deps.artifacts.remove(ctx.topic.slug, ctx.runId, VELOG_ARTIFACT);
    },
  };
}
