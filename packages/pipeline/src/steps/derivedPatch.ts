// 뒤 단계 고침 — 답 반영 실행의 링크드인·Zenn 단계(decisions/review-questions.md). 처음부터 다시 쓰지 않고
// **이전 결과 + 본문에서 바뀐 곳**을 주고 그 대목만 고친다.
//  1) 본문에서 바뀐 곳 = 고치기 전·후 벨로그 본문의 문단 diff(`[확인 필요]` 주석은 걷어내고 견준다 — 주석만 지운 문단은 바뀐 것이 아니다).
//     바뀐 곳이 없으면 모델을 부르지 않고 이전 결과를 그대로 쓴다.
//  2) 모델이 돌려준 글은 믿지 않는다 — 본문과 같은 규칙(한 곳 = 문단 ±1)을 **곳 수**로 건다(`checkPatchPlaces`): 이 글에서 바뀐
//     문단을 덮는 창이 본문에서 바뀐 곳 수 이하여야 한다. 반려면 1회 재시도, 또 반려면 **이전 결과 그대로** 두고 그 사실을 남긴다.
// 결과는 단계마다 `<단계>-patch.json`에 남긴다(DATA_DIR만). 단계별 차이(산출물 이름·머리·출력 다듬기)는 `DerivedPatchSpec`으로 받는다.
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { loadTonePrompt, type TonePrompt } from '../prompts/tonePrompts.ts';
import {
  REVIEW_RESULT_ARTIFACT,
  derivedPatchArtifact,
  parseReviewResult,
  renderDerivedPatchResult,
  type DerivedPatchResult,
  type DerivedPatchStep,
} from '../review/answerResult.ts';
import { stripReviewComments } from '../review/answers.ts';
import {
  checkPatchPlaces,
  coverChangedParagraphs,
  paragraphHunks,
  type ParagraphHunk,
} from '../run/patchScope.ts';
import { StepFailure, type StepContext, type StepResult } from './StepRunner.ts';
import { abortable, classifyModelError, fenceFor, tonePromptFailure } from './writing.ts';

/** 모델 시도 횟수 — 첫 시도 + 범위 밖·출력 불량일 때 재시도 1회(본문 고침과 같다). */
export const DERIVED_PATCH_ATTEMPTS = 2;

/** 벨로그 본문 산출물 이름 — velogStep.ts의 `VELOG_ARTIFACT`와 같은 값(순환 import를 피해 여기 따로 둔다). */
const VELOG_ARTIFACT = 'velog.md';

export interface DerivedPatchDeps {
  artifacts: ArtifactStore;
  promptsDir: string;
  adapters: { get(id: string): ModelAdapter | undefined };
}

/** 단계별 차이 — 링크드인·Zenn이 각자 채운다. */
export interface DerivedPatchSpec {
  step: DerivedPatchStep;
  /** 고칠 산출물 이름(linkedin.md·zenn.md). */
  artifact: string;
  /** 실패 코드 접두(LINKEDIN·ZENN). */
  codePrefix: string;
  /** 문구에 쓰는 이름("링크드인 글"·"Zenn 기사"). */
  label: string;
  maxOutputTokens: number;
  /** system 머리에 덧붙일 이 단계만의 규칙 줄(없으면 빈 배열). */
  rules: readonly string[];
  /** 이전 산출물 → 모델이 손대지 않는 머리(Zenn frontmatter)와 고칠 글. */
  split(text: string): { head: string; body: string };
  /** 머리 + 고친 글 → 산출물. */
  join(head: string, body: string): string;
  /** 모델 출력 다듬기(전체 펜스·frontmatter 벗기기). */
  clean(output: string): string;
}

const systemOf = (spec: DerivedPatchSpec) =>
  [
    `당신은 이미 쓰인 ${spec.label}을, 원본인 벨로그 본문이 고쳐진 데 맞춰 고치는 편집자입니다.`,
    '- 고칠 수 있는 곳은 사용자 메시지 "본문에서 바뀐 곳"의 내용을 다루는 문단과 그 바로 앞뒤 문단뿐입니다. 그 밖의 모든 문단은',
    '  글자 하나, 줄바꿈 하나도 바꾸지 않고 원문 그대로 출력합니다(다듬기·순서 변경·추가·삭제 금지).',
    '- "바뀐 뒤"의 사실을 반영하고, 본문에서 빠진 사실은 이 글에서도 뺍니다. 바뀐 내용을 이 글이 다루지 않았다면 아무것도 바꾸지 않고',
    '  이전 글을 그대로 출력합니다(새 문단을 만들어 넣지 않습니다).',
    '- 본문에 없는 사실은 지어내지 않습니다. 대괄호 토큰([COMPANY], 링크 자리 등)은 그대로 둡니다.',
    '- 고치는 문장의 어투는 아래 "어투" 규칙과 주변 문장에 맞춥니다.',
    ...spec.rules,
    '- 출력은 고친 글 전체 하나이며, 코드 펜스로 감싸거나 앞뒤에 설명을 붙이지 않습니다.',
    '',
    '',
  ].join('\n');

const block = (paragraphs: readonly string[], none: string): string[] => {
  if (paragraphs.length === 0) return [none];
  const text = paragraphs.join('\n\n');
  const fence = fenceFor(text);
  return [fence, text, fence];
};

/** 모델에 보내는 프롬프트 — 테스트용으로 공개. `retry`면 직전 시도가 반려됐다는 주의를 덧붙인다. */
export function buildDerivedPatchPrompt(input: {
  spec: DerivedPatchSpec;
  /** 이전 결과에서 고칠 글(머리 제외). */
  previous: string;
  hunks: readonly ParagraphHunk[];
  tone: TonePrompt;
  retry?: boolean;
}): { system: string; prompt: string } {
  const lines: string[] = [`# 본문에서 바뀐 곳(${input.hunks.length}곳)`];
  input.hunks.forEach((hunk, index) => {
    lines.push(
      `## ${index + 1}.`,
      '바뀌기 전:',
      ...block(hunk.removed, '(없음 — 새로 들어간 문단)'),
      '바뀐 뒤:',
      ...block(hunk.added, '(없음 — 본문에서 빠졌다)'),
      '',
    );
  });
  const fence = fenceFor(input.previous);
  lines.push(
    `# 이전 ${input.spec.label} 전체`,
    fence,
    input.previous.trim(),
    fence,
    '',
    '# 요청',
    `본문에서 바뀐 곳을 반영해 고친 ${input.spec.label} 전체를 출력하세요. 그 대목 밖은 이전 글과 완전히 같아야 합니다.`,
  );
  if (input.retry === true)
    lines.push(
      '',
      '# 주의',
      '직전 시도는 바뀐 곳과 상관없는 문단을 바꿨거나 글을 끝까지 출력하지 않아 반려됐습니다. 그 밖의 문단은 이전 글을 그대로 복사하세요.',
    );
  return { system: systemOf(input.spec) + input.tone.text, prompt: lines.join('\n') };
}

/** 뒤 단계 고침 실행 — `ctx.patch`가 있는 링크드인·Zenn 단계. 산출물과 `<단계>-patch.json`을 쓰고 StepResult를 돌려준다. */
export async function runDerivedPatch(
  deps: DerivedPatchDeps,
  ctx: StepContext & { patch: NonNullable<StepContext['patch']> },
  spec: DerivedPatchSpec,
): Promise<StepResult> {
  const { slug } = ctx.topic;
  const { baseRunId } = ctx.patch;
  const fail = (code: string, message: string) =>
    new StepFailure(`${spec.codePrefix}_${code}`, message, false);

  const base = await deps.artifacts.read(slug, baseRunId, spec.artifact);
  if (!base.ok)
    throw fail(
      'PATCH_BASE_MISSING',
      `고칠 이전 ${spec.label}을 찾지 못했습니다(DATA_DIR). 벨로그 본문부터 재실행하세요.`,
    );

  // 본문이 이 실행에서 고쳐지지 않았으면(이전 본문 유지) 바뀐 곳이 없다.
  let hunks: ParagraphHunk[] = [];
  let places = 0;
  if (ctx.sources.velog === undefined) {
    const result = await deps.artifacts.read(slug, ctx.runId, REVIEW_RESULT_ARTIFACT);
    const parsed = result.ok ? parseReviewResult(result.text) : undefined;
    if (parsed === undefined)
      throw fail(
        'PATCH_BODY_RESULT_MISSING',
        '이 실행의 본문 고침 결과를 찾지 못했습니다. 벨로그 본문부터 재실행하세요.',
      );
    const before = await deps.artifacts.read(slug, parsed.baseRunId, VELOG_ARTIFACT);
    const after = await deps.artifacts.read(slug, ctx.runId, VELOG_ARTIFACT);
    if (!before.ok || !after.ok)
      throw fail(
        'BODY_MISSING',
        '벨로그 본문(고치기 전·후)을 찾지 못했습니다. 벨로그 본문부터 재실행하세요.',
      );
    const previousBody = stripReviewComments(before.text);
    const nextBody = stripReviewComments(after.text);
    hunks = paragraphHunks(previousBody, nextBody);
    places = coverChangedParagraphs(previousBody, nextBody).length;
  }

  const usage = { input: 0, output: 0, costUsd: 0 };
  let adapterId: string | undefined;
  let promptHash: string | undefined;
  let text = base.text;
  let outcome: Pick<DerivedPatchResult, 'status' | 'code'> = { status: 'unchanged' };

  if (hunks.length > 0) {
    const adapter = deps.adapters.get(ctx.modelId);
    if (adapter === undefined)
      throw fail('MODEL_UNKNOWN', '이 실행의 모델이 레지스트리에 없습니다.');
    if (!adapter.available) throw fail('MODEL_UNAVAILABLE', '모델 API 키가 .env에 없습니다.');
    const tone = await loadTonePrompt(deps.promptsDir, spec.step);
    if (!tone.ok) throw tonePromptFailure(tone);
    adapterId = adapter.id;
    promptHash = tone.value.hash;

    const { head, body: previous } = spec.split(base.text);
    let patched: string | undefined;
    let lastFailure: NonNullable<DerivedPatchResult['code']> = 'PATCH_OUTPUT_INVALID';
    for (
      let attempt = 1;
      attempt <= DERIVED_PATCH_ATTEMPTS && patched === undefined;
      attempt += 1
    ) {
      const { system, prompt } = buildDerivedPatchPrompt({
        spec,
        previous,
        hunks,
        tone: tone.value,
        retry: attempt > 1,
      });
      ctx.signal.throwIfAborted();
      let generated: GenerateResult;
      try {
        generated = await abortable(
          adapter.generate({ system, prompt, maxOutputTokens: spec.maxOutputTokens }),
          ctx.signal,
        );
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        throw classifyModelError(error, `${spec.codePrefix}_MODEL_FAILED`);
      }
      usage.input += generated.usage.inputTokens;
      usage.output += generated.usage.outputTokens;
      usage.costUsd += generated.costUsd;

      const candidate = spec.clean(generated.text);
      if (generated.truncated || candidate === '') {
        lastFailure = 'PATCH_OUTPUT_INVALID';
        continue;
      }
      if (checkPatchPlaces(previous, candidate, places).ok) patched = candidate;
      else lastFailure = 'PATCH_OUT_OF_SCOPE';
    }

    if (patched === undefined) {
      // 두 번 다 반려 — 범위 밖이 바뀐 글은 승인본이 되지 않는다. 이전 결과를 그대로 두고 반영 못 했음을 남긴다.
      outcome = { status: 'kept', code: lastFailure };
    } else if (coverChangedParagraphs(previous, patched).length > 0) {
      text = spec.join(head, patched);
      outcome = { status: 'patched' };
    }
    // 모델이 아무것도 바꾸지 않았으면(바뀐 내용을 이 글이 다루지 않음) 이전 결과 그대로 — unchanged.
  }

  const record = renderDerivedPatchResult({ version: 1, baseRunId, ...outcome });
  const recordName = derivedPatchArtifact(spec.step);
  try {
    await deps.artifacts.write(slug, ctx.runId, spec.artifact, text);
    await deps.artifacts.write(slug, ctx.runId, recordName, record);
  } catch (error) {
    throw new StepFailure(
      `${spec.codePrefix}_STORE_WRITE_FAILED`,
      `${spec.label}을 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).`,
      false,
      { cause: error },
    );
  }
  return {
    artifacts: { [spec.artifact]: text, [recordName]: record },
    ...(adapterId === undefined
      ? {}
      : {
          tokens: { input: usage.input, output: usage.output },
          costUsd: usage.costUsd,
          model: adapterId,
          ...(promptHash === undefined ? {} : { promptHash }),
        }),
  };
}
