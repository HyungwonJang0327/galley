// 벨로그 본문 고침 — 답 반영 실행의 본문 단계(decisions/review-questions.md). 처음부터 다시 쓰지 않고 **이전 본문에서 답한 곳만** 고친다.
//  1) 모름·삭제는 코드(`applyCodeAnswers`) — 모델 호출 없음.
//  2) 채움만 모델: 이전 본문 전체 + 질문·답 + 고칠 문단을 주고 본문 전체를 다시 받는다. 받은 글은 믿지 않고 범위 검사
//     (`checkPatchScope`, 앵커 ±1문단)를 통과해야 채택한다. 실패하면 1회 재시도, 또 실패하면 **이전 본문 그대로** 두고 그 질문들을 미반영으로 남긴다.
// 근거 묶음은 읽지 않는다 — 채움의 사실은 사람이 준 답이다. 결과는 질문 단위로 `review-result.json`에 남긴다.
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { loadTonePrompt, type TonePrompt } from '../prompts/tonePrompts.ts';
import type { ReviewAnswerItem } from '../review/answerSet.ts';
import {
  REVIEW_RESULT_ARTIFACT,
  renderReviewResult,
  type ReviewResult,
  type ReviewUnappliedCode,
} from '../review/answerResult.ts';
import { applyCodeAnswers, locateQuestion } from '../review/answers.ts';
import { splitParagraphs } from '../review/paragraphs.ts';
import { checkPatchScope } from '../run/patchScope.ts';
import type { WritingLimits } from './limits.ts';
import { StepFailure, type StepContext, type StepResult } from './StepRunner.ts';
import { abortable, classifyModelError, tonePromptFailure, unwrapFence } from './writing.ts';

/** 모델 시도 횟수 — 첫 시도 + 범위 밖·출력 불량일 때 재시도 1회(사용자 결정). */
export const VELOG_PATCH_ATTEMPTS = 2;

const ARTIFACT = 'velog.md';

export interface VelogPatchDeps {
  artifacts: ArtifactStore;
  promptsDir: string;
  adapters: { get(id: string): ModelAdapter | undefined };
}

/** 채움 하나 — 지금 본문에서 다시 찾은 자리와 함께. */
export interface VelogPatchTarget {
  item: ReviewAnswerItem & { answer: { kind: 'fill'; text: string } };
  /** 고칠 문단 번호(0부터)와 줄 번호(1부터) — **모델에 주는 본문 기준**. */
  paragraph: number;
  line: number;
}

const PATCH_SYSTEM = `당신은 이미 쓰인 기술 블로그 본문을, 작성자가 확인 질문에 준 답으로 고치는 편집자입니다.
- 고칠 수 있는 곳은 사용자 메시지 "고칠 곳"에 적힌 문단과 그 바로 앞뒤 문단뿐입니다. 그 밖의 모든 문단은 글자 하나, 줄바꿈 하나도
  바꾸지 않고 원문 그대로 출력합니다(다듬기·순서 변경·추가·삭제 금지).
- 각 답의 사실을 그 문단에 자연스럽게 반영합니다. 답에 없는 사실은 지어내지 않습니다.
- 답을 반영한 질문의 <!-- [확인 필요] … --> 주석은 지웁니다. 그 밖의 주석(<!-- [삽화] … -->, 답하지 않은 [확인 필요])은 그대로 둡니다.
- 고치는 문장의 어투는 아래 "어투" 규칙과 주변 문장에 맞춥니다.
- 출력은 고친 본문 전체(마크다운) 하나이며, 코드 펜스로 감싸거나 앞뒤에 설명을 붙이지 않습니다.

`;

/** 모델에 보내는 프롬프트 — 테스트용으로 공개. `retry`면 직전 시도가 반려됐다는 주의를 덧붙인다. */
export function buildVelogPatchPrompt(input: {
  body: string;
  targets: readonly VelogPatchTarget[];
  tone: TonePrompt;
  retry?: boolean;
}): { system: string; prompt: string } {
  const paragraphs = splitParagraphs(input.body);
  const lines: string[] = [`# 고칠 곳(${input.targets.length}건)`];
  input.targets.forEach((target, index) => {
    const { question, answer } = target.item;
    lines.push(
      `## ${index + 1}. 본문 ${target.line}번째 줄의 문단`,
      '문단 원문:',
      paragraphs[target.paragraph]?.text ?? '',
      '',
      question.source === 'comment'
        ? `질문: ${question.question}`
        : `질문: 이 문장은 근거가 확인되지 않았습니다 — "${question.question}"`,
      `작성자의 답: ${answer.text}`,
      '',
    );
  });
  lines.push('# 본문 전체', input.body.trimEnd(), '');
  lines.push(
    '# 요청',
    '위 답을 반영해 고친 본문 전체를 출력하세요. 고칠 곳과 그 바로 앞뒤 문단 밖은 원문과 완전히 같아야 합니다.',
  );
  if (input.retry === true)
    lines.push(
      '',
      '# 주의',
      '직전 시도는 고칠 곳 밖의 문단을 바꿨거나 본문을 끝까지 출력하지 않아 반려됐습니다. 그 밖의 문단은 원문을 그대로 복사하세요.',
    );
  return { system: PATCH_SYSTEM + input.tone.text, prompt: lines.join('\n') };
}

const isFill = (item: ReviewAnswerItem): item is VelogPatchTarget['item'] =>
  item.answer.kind === 'fill';

/** 본문 고침 실행 — `ctx.patch`가 있는 velog 단계. 산출물(velog.md·review-result.json)을 쓰고 StepResult를 돌려준다. */
export async function runVelogPatch(
  deps: VelogPatchDeps,
  ctx: StepContext & { patch: NonNullable<StepContext['patch']> },
  limits: WritingLimits,
): Promise<StepResult> {
  const { baseRunId } = ctx.patch;
  // 삽화 질문의 답(다시 만들기)은 본문을 고치지 않는다 — 실행 계획이 이미 삽화 단계를 다시 돌리게 했다. 반영된 것으로 남긴다.
  const items = ctx.patch.answers.filter((item) => item.question.source !== 'illustration');
  const redone = ctx.patch.answers
    .filter((item) => item.question.source === 'illustration')
    .map((item) => item.question.id);
  const base = await deps.artifacts.read(ctx.topic.slug, baseRunId, ARTIFACT);
  if (!base.ok)
    throw new StepFailure(
      'VELOG_PATCH_BASE_MISSING',
      '고칠 이전 본문을 찾지 못했습니다(DATA_DIR). 본문부터 재실행하세요.',
      false,
    );

  const applied: string[] = [];
  const unapplied: ReviewResult['unapplied'] = [];

  // 1) 모름·삭제 — 코드.
  const coded = applyCodeAnswers(
    base.text,
    items.map((item) => item.question),
    items.map((item) => item.answer),
  );
  applied.push(...coded.applied);
  unapplied.push(...coded.failed);
  let body = coded.body;

  // 2) 채움 — 코드 수정으로 줄이 밀렸을 수 있어 자리를 지금 본문에서 다시 찾는다.
  const targets: VelogPatchTarget[] = [];
  for (const item of items.filter(isFill)) {
    const at = locateQuestion(body, item.question);
    if (at === undefined) unapplied.push({ id: item.question.id, code: 'ANCHOR_NOT_FOUND' });
    else targets.push({ item, paragraph: at.paragraph, line: at.line });
  }

  const usage = { input: 0, output: 0, costUsd: 0 };
  let adapterId: string | undefined;
  let promptHash: string | undefined;
  if (targets.length > 0) {
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
    adapterId = adapter.id;
    promptHash = tone.value.hash;

    const anchors = targets.map((target) => target.paragraph);
    let patched: string | undefined;
    let lastFailure: ReviewUnappliedCode = 'PATCH_OUTPUT_INVALID';
    for (let attempt = 1; attempt <= VELOG_PATCH_ATTEMPTS && patched === undefined; attempt += 1) {
      const { system, prompt } = buildVelogPatchPrompt({
        body,
        targets,
        tone: tone.value,
        retry: attempt > 1,
      });
      ctx.signal.throwIfAborted();
      let generated: GenerateResult;
      try {
        generated = await abortable(
          adapter.generate({ system, prompt, maxOutputTokens: limits.velogMaxOutputTokens }),
          ctx.signal,
        );
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        throw classifyModelError(error, 'VELOG_MODEL_FAILED');
      }
      usage.input += generated.usage.inputTokens;
      usage.output += generated.usage.outputTokens;
      usage.costUsd += generated.costUsd;

      const text = unwrapFence(generated.text.trim()).trim();
      if (generated.truncated || text === '') {
        lastFailure = 'PATCH_OUTPUT_INVALID';
        continue;
      }
      const candidate = `${text}\n`;
      if (checkPatchScope(body, candidate, anchors).ok) patched = candidate;
      else lastFailure = 'PATCH_OUT_OF_SCOPE';
    }

    if (patched === undefined) {
      // 두 번 다 반려 — 범위 밖이 바뀐 글은 승인본이 되지 않는다. 이전 본문(코드 수정까지 반영된 것)을 그대로 둔다.
      for (const target of targets)
        unapplied.push({ id: target.item.question.id, code: lastFailure });
    } else {
      // 모델이 남겨 둔 답한 질문의 주석은 코드로 지운다(이미 지웠으면 못 찾을 뿐 — 실패로 치지 않는다).
      const leftovers = targets.map((target) => target.item.question);
      body = applyCodeAnswers(
        patched,
        leftovers.filter((question) => question.source === 'comment'),
        leftovers.map((question) => ({ id: question.id, kind: 'keep' as const })),
      ).body;
      applied.push(...targets.map((target) => target.item.question.id));
    }
  }

  applied.push(...redone);
  const order = new Map(ctx.patch.answers.map((item, index) => [item.question.id, index]));
  const byOrder = (a: string, b: string) => (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const result = renderReviewResult({
    version: 1,
    baseRunId,
    applied: applied.sort(byOrder),
    unapplied: unapplied.sort((a, b) => byOrder(a.id, b.id)),
  });
  try {
    await deps.artifacts.write(ctx.topic.slug, ctx.runId, ARTIFACT, body);
    await deps.artifacts.write(ctx.topic.slug, ctx.runId, REVIEW_RESULT_ARTIFACT, result);
  } catch (error) {
    throw new StepFailure(
      'VELOG_STORE_WRITE_FAILED',
      '본문을 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
      false,
      { cause: error },
    );
  }
  return {
    artifacts: { [ARTIFACT]: body, [REVIEW_RESULT_ARTIFACT]: result },
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
