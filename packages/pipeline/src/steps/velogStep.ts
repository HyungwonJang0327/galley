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
import { loadTonePrompt, type TonePrompt, type TonePromptFailure } from '../prompts/tonePrompts.ts';
import { stripTopicHints } from '../queue/normalizeTitle.ts';
import { WRITING_LIMITS, type WritingLimits } from './limits.ts';

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

/** 어투 로더의 값 실패 → 단계 실패(재시도 불가). 링크드인·Zenn 단계가 같은 헬퍼를 쓴다. 문구에 절대경로 없음(파일명만). */
export function tonePromptFailure(failure: TonePromptFailure): StepFailure {
  const file = `${failure.step}.md`;
  const message =
    failure.code === 'PROMPT_NOT_FOUND'
      ? `어투 프롬프트 파일(${file})이 없습니다.`
      : failure.code === 'PROMPT_EMPTY'
        ? `어투 프롬프트 파일(${file})이 비어 있습니다.`
        : `어투 프롬프트 파일(${file})을 읽지 못했습니다.`;
  return new StepFailure(failure.code, message, false);
}

/** 어댑터가 거부 응답에 붙이는 고정 접두(Anthropic·OpenAI 둘 다) — 이것으로만 거부를 판정한다. */
const REFUSAL_PREFIX = '모델이 응답을 거부했습니다';

/**
 * 모델 호출 실패의 재시도 분류(decisions/error-handling.md): 네트워크·레이트리밋·5xx·타임아웃은 재시도, 인증·거부·프롬프트 초과는
 * 영구. SDK 오류는 `status`를 갖고, 연결 오류는 클래스 이름·문구로 안다. 행에 남는 문구는 고정(원본은 cause로 — 응답 원문·키가
 * 남지 않게).
 */
export function classifyModelError(error: unknown, code: string): StepFailure {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : undefined;
  const names = error instanceof Error ? `${error.constructor.name} ${error.name}` : '';
  const message = error instanceof Error ? error.message : String(error);
  const transient =
    (status !== undefined &&
      (status === 408 || status === 409 || status === 429 || status >= 500)) ||
    /connection|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(`${names} ${message}`);
  const refusal = !transient && message.startsWith(REFUSAL_PREFIX);
  const text = transient
    ? '모델 호출이 일시적으로 실패했습니다(네트워크·레이트리밋). 다시 시도합니다.'
    : refusal
      ? '모델이 응답을 거부했습니다. 입력(근거·지시)을 확인하세요.'
      : '모델 호출에 실패했습니다(인증·모델·입력 크기를 확인하세요).';
  return new StepFailure(code, text, transient, { cause: error });
}

/**
 * 호출을 signal과 경주시킨다 — 어댑터는 signal을 받지 않아 호출 자체는 끊지 못하지만(GenerateInput에 자리 없음), 단계는 워커의
 * 타임아웃·종료 신호에 즉시 반환된다. 끊긴 호출의 결과는 버린다.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
const abortError = (): Error => {
  const e = new Error('실행이 중단되었습니다.');
  e.name = 'AbortError';
  return e;
};

const SYSTEM_PREFIX = `당신은 아래 "어투" 규칙대로 기술 블로그 초안을 쓰는 작성자입니다.
- 사실(수치·시점·동작·결정과 그 이유·에피소드)은 오직 사용자 메시지의 "근거 묶음"에 있는 것만 씁니다. 근거에 없는 사실은 지어내지 말고,
  확실하지 않은 것은 <!-- [확인 필요] ... --> 주석으로 남깁니다.
- 코드·식별자·경로는 어투 규칙대로 일반 이름으로 바꿔 클린룸으로 다시 씁니다. 바꾸는 것은 이름뿐이고 새 사실을 만들지 않습니다.
- 근거 조각에 든 대괄호 치환 표기(예: [COMPANY], [EMAIL], [INTERNAL_URL] 같은 대문자 토큰)는 풀어 쓰지 말고 그대로 둡니다.
- 출력은 마크다운 본문 하나이며, 전체를 코드 펜스로 감싸거나 앞뒤에 설명을 붙이지 않습니다.

`;

/** 조각 안 최장 백틱 연속보다 긴 펜스(최소 3) — 조각의 ```가 프롬프트 구조를 닫지 못하게. */
export function fenceFor(text: string): string {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** 모델이 전체를 하나의 코드 펜스로 감싼 경우 벗긴다(SYSTEM_PREFIX가 금지하지만 강제는 아니다). */
export function unwrapFence(text: string): string {
  const m = /^(`{3,})(?:markdown|md)?\s*\n([\s\S]*?)\n\1\s*$/.exec(text);
  return m === null ? text : m[2]!;
}

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

  lines.push(`# 근거 묶음(${bundle.items.length}개 조각 — 이것이 사실의 전부)`);
  let used = 0;
  let omitted = 0;
  bundle.items.forEach((item, i) => {
    const head = `## 조각 ${i + 1} — ${item.path} L${item.lineRange.start}-${item.lineRange.end} (${item.commit.slice(0, 7)}, ${item.date.slice(0, 10)}, ${item.source})`;
    lines.push(head);
    if (item.note !== undefined) lines.push(`note: ${item.note}`);
    if (used + item.snippet.length <= limits.evidenceChars) {
      const fence = fenceFor(item.snippet);
      lines.push(fence, item.snippet, fence);
      used += item.snippet.length;
    } else {
      omitted += 1;
      lines.push('(조각 본문은 입력 상한으로 생략 — 경로·라인만 참고)');
    }
    if (item.truncated) lines.push('(조각은 상한으로 잘렸다)');
    lines.push('');
  });
  if (omitted > 0) lines.push(`(입력 상한으로 조각 본문 ${omitted}개 생략)`, '');
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
