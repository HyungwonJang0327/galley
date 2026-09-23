// Zenn 일본어판 단계(zenn) — 입력은 **벨로그 본문 + 어투 프롬프트 + 수정 지시**뿐이다(링크드인과 같은 골격, 본문에서만 파생 —
// decisions/evidence-collection.md). 본문은 ArtifactStore(DATA_DIR)에서 `sources.velog ?? runId`로 읽고, 어투는
// `.galley/prompts/zenn.md`(BS1), 산출물 `zenn.md`는 ArtifactStore에 직접 쓴다.
// frontmatter는 **코드가 만든다** — `published: false`(下書き)는 항상 고정이고 모델이 frontmatter를 내도 버린다
// (decisions/publish-gate.md · zenn-push.md). 제목은 출력 첫 `# ` 줄에서 뽑아 frontmatter로 옮긴다(Zenn은 제목을
// frontmatter에서 그리므로 본문 H1은 중복). emoji·type은 고정값, topics는 비워 두고 사람이 검수 때 채운다.
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { loadTonePrompt, type TonePrompt } from '../prompts/tonePrompts.ts';
import { stripTopicHints } from '../queue/normalizeTitle.ts';
import { WRITING_LIMITS, type WritingLimits } from './limits.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import {
  abortable,
  classifyModelError,
  fenceFor,
  tonePromptFailure,
  unwrapFence,
} from './writing.ts';

export interface ZennStepDeps {
  /** 산출물 저장소(DATA_DIR) — 벨로그 본문을 여기서 읽고 zenn.md를 여기에 쓴다. */
  artifacts: ArtifactStore;
  /** 어투 프롬프트 폴더(절대경로) — 조립 루트가 resolveTonePromptsDir로 정해 넘긴다. */
  promptsDir: string;
  /** 레지스트리 조회(모델 id → 어댑터). */
  adapters: { get(id: string): ModelAdapter | undefined };
  limits?: WritingLimits;
}

/** Zenn 단계의 입력 전부 — 근거 번들·리포 경로·분석 글 자리가 없다(본문에서만 파생). */
export interface ZennInput {
  /** 제목은 괄호 힌트를 뗀 것만(벨로그 단계와 같은 규칙). frontmatter title의 대비책. */
  topic: { title: string; slug: string };
  /** 벨로그 본문(velog.md 전체). 사실의 전부. */
  body: string;
  tone: TonePrompt;
  instruction?: string;
}

/** 산출물 이름 — posts/<슬러그>/zenn.md(B3a), Phase 2에서 zenn-content `articles/<슬러그>.md`로. */
export const ZENN_ARTIFACT = 'zenn.md';

/**
 * Zenn frontmatter 고정값. `published`는 값이 아니라 **불변 규칙**이라 타입에서도 false뿐이다(publish-gate).
 * emoji는 Zenn이 요구하는 한 글자(본문에는 이모지 없음 — 어투), type은 기술 글, topics는 검수 때 사람이.
 */
export const ZENN_FRONTMATTER = {
  emoji: '📝',
  type: 'tech',
  topics: [] as readonly string[],
  published: false,
} as const;

const SYSTEM_PREFIX = `당신은 아래 "어투" 규칙대로 한국어 기술 블로그 글을 일본어 Zenn 기사로 다시 쓰는 작성자입니다.
- 사실(수치·시점·동작·결정과 그 이유·에피소드)은 오직 사용자 메시지의 "벨로그 본문"에 있는 것만 씁니다. 본문에 없는 사실은
  지어내지 말고, 본문에 있는 <!-- [확인 필요] ... --> 주석의 내용은 확정된 사실로 쓰지 않습니다.
- 코드·표는 벨로그 본문의 것을 그대로 옮기고(주석·label만 일본어) 새 코드는 넣지 않습니다. 본문의 코드·식별자·경로 중 이미
  일반 이름으로 바뀐 것은 그대로 두고, 회사 고유 이름(회사명·도메인·내부 경로·필드명)이 남아 있으면 어투 규칙대로 일반
  이름으로 바꿉니다. 바꾸는 것은 이름뿐입니다.
- 본문의 대괄호 치환 표기(예: [COMPANY], [EMAIL] 같은 대문자 토큰)는 풀어 쓰지 말고 그대로 둡니다. 어투가 요구하는
  벨로그 링크 자리도 토큰([velogリンク]) 그대로 둡니다(발행 뒤 사람이 채웁니다).
- 출력은 마크다운 본문 하나이며 첫 줄은 "# 제목"입니다. YAML frontmatter(--- 블록)는 넣지 않습니다(시스템이 붙입니다).
  전체를 코드 펜스로 감싸거나 앞뒤에 설명을 붙이지 않습니다.

`;

/** 모델에 보내는 프롬프트 — 테스트·미리보기용으로 공개. system = 어투, user = 주제·지시·벨로그 본문. */
export function buildZennPrompt(input: ZennInput): { system: string; prompt: string } {
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
    '위 어투 규칙대로 이 본문을 일본어 Zenn 기사로 다시 쓰세요.',
  );
  return { system: SYSTEM_PREFIX + input.tone.text, prompt: lines.join('\n') };
}

/**
 * 모델 출력 앞의 YAML frontmatter(`---` 블록)를 버린다 — published 값은 모델이 정할 수 없다. 변화가 없을 때까지 반복해
 * 두 번 온 블록도 버리고, 빈 블록(`---\n---`)도 잡는다. 블록 안에 `key:` 꼴 줄이 하나도 없으면 frontmatter가 아니라
 * 본문의 구분선으로 보고 그대로 둔다(첫 문단이 사라지지 않게).
 */
export function stripFrontmatter(text: string): string {
  let current = text;
  for (;;) {
    const m = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(current);
    if (m === null) return current;
    const inner = m[1] ?? '';
    const looksLikeYaml = inner.trim() === '' || /^[A-Za-z_][\w-]*[ \t]*:/m.test(inner);
    if (!looksLikeYaml) return current;
    current = current.slice(m[0].length).replace(/^(?:[ \t]*\r?\n)+/, '');
  }
}

/**
 * 첫 `# ` 줄을 제목으로 떼어 낸다. 앞쪽 빈 줄·HTML 주석 줄(`<!-- [挿絵] -->` 등)은 건너뛰어 찾고 본문에는 남긴다.
 * 닫는 ATX `#`는 뗀다. 제목 줄이 없으면 본문은 그대로, 제목은 대비책(fallback).
 */
export function splitTitle(text: string, fallback: string): { title: string; body: string } {
  const lead = /^(?:[ \t]*\r?\n|[ \t]*<!--[\s\S]*?-->[ \t]*(?:\r?\n|$))*/.exec(text)![0];
  const rest = text.slice(lead.length);
  const m = /^[ \t]*#[ \t]+([^\r\n]*?)[ \t]*(?:\r?\n|$)/.exec(rest);
  if (m === null) return { title: fallback, body: text };
  const title = m[1]!.replace(/[ \t]+#+$/, '').trim();
  if (title === '') return { title: fallback, body: text };
  const after = rest.slice(m[0].length).replace(/^(?:[ \t]*\r?\n)+/, '');
  return { title, body: (lead + after).replace(/^(?:[ \t]*\r?\n)+/, '') };
}

/** frontmatter 직렬화 — 제목은 JSON 문자열(유효한 YAML 큰따옴표 문자열)로 따옴표·콜론·개행을 안전하게. */
export function renderZennArticle(title: string, body: string): string {
  const topics = `[${ZENN_FRONTMATTER.topics.map((t) => JSON.stringify(t)).join(', ')}]`;
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `emoji: ${JSON.stringify(ZENN_FRONTMATTER.emoji)}`,
    `type: ${JSON.stringify(ZENN_FRONTMATTER.type)}`,
    `topics: ${topics}`,
    `published: ${String(ZENN_FRONTMATTER.published)}`,
    '---',
    '',
    body.trim(),
    '',
  ].join('\n');
}

export function createZennStepRunner(deps: ZennStepDeps): StepRunner {
  const limits = deps.limits ?? WRITING_LIMITS;
  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'zenn')
        throw new Error(`zenn 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅(BS5) 오류`);
      ctx.signal.throwIfAborted();

      const adapter = deps.adapters.get(ctx.modelId);
      if (adapter === undefined)
        throw new StepFailure(
          'ZENN_MODEL_UNKNOWN',
          '이 실행의 모델이 레지스트리에 없습니다.',
          false,
        );
      if (!adapter.available)
        throw new StepFailure('ZENN_MODEL_UNAVAILABLE', '모델 API 키가 .env에 없습니다.', false);

      const tone = await loadTonePrompt(deps.promptsDir, 'zenn');
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
              'ZENN_BODY_MISSING',
              '벨로그 본문이 없습니다. 벨로그 본문 단계부터 다시 실행하세요.',
              false,
            )
          : new StepFailure(
              'ZENN_BODY_UNREADABLE',
              '벨로그 본문을 읽지 못했습니다(DATA_DIR 권한을 확인하세요).',
              false,
            );
      const body = read.text.trim();
      if (body === '')
        throw new StepFailure(
          'ZENN_BODY_EMPTY',
          '벨로그 본문이 비어 있어 Zenn 기사를 쓰지 않습니다. 벨로그 본문 단계부터 다시 실행하세요.',
          false,
        );

      const { system, prompt } = buildZennPrompt({
        topic: { title: ctx.topic.title, slug: ctx.topic.slug },
        body,
        tone: tone.value,
        ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
      });
      ctx.signal.throwIfAborted();
      let generated: GenerateResult;
      try {
        generated = await abortable(
          adapter.generate({ system, prompt, maxOutputTokens: limits.zennMaxOutputTokens }),
          ctx.signal,
        );
      } catch (error) {
        if (ctx.signal.aborted) throw error; // 워커가 끊은 것 — 실패가 아니라 중단
        throw classifyModelError(error, 'ZENN_MODEL_FAILED');
      }
      if (generated.truncated)
        throw new StepFailure(
          'ZENN_OUTPUT_TRUNCATED',
          'Zenn 기사가 출력 상한에서 잘렸습니다. 어투의 분량 규칙을 확인하거나 출력 상한을 올리세요.',
          false,
        );
      // 줄바꿈은 LF로 통일(frontmatter와 본문이 섞이지 않게) → 전체 펜스 → 앞 frontmatter → 제목 → 제목 뒤 frontmatter.
      const text = stripFrontmatter(
        unwrapFence(generated.text.replace(/\r\n/g, '\n').trim()).trim(),
      ).trim();
      if (text === '')
        throw new StepFailure('ZENN_OUTPUT_EMPTY', '모델이 빈 기사를 돌려줬습니다.', true);
      const fallbackTitle = stripTopicHints(ctx.topic.title).trim();
      const split = splitTitle(text, fallbackTitle);
      if (split.title === '')
        throw new StepFailure(
          'ZENN_TITLE_MISSING',
          '기사 제목을 찾지 못했습니다(첫 줄 # 제목이 없고 주제 제목도 비어 있음).',
          true,
        );
      const article = stripFrontmatter(split.body).trim();
      if (article === '')
        throw new StepFailure('ZENN_OUTPUT_EMPTY', '모델이 제목만 돌려줬습니다.', true);
      const { title } = split;
      const rendered = renderZennArticle(title, article);
      try {
        await deps.artifacts.write(ctx.topic.slug, ctx.runId, ZENN_ARTIFACT, rendered);
      } catch (error) {
        throw new StepFailure(
          'ZENN_STORE_WRITE_FAILED',
          'Zenn 기사를 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }
      return {
        artifacts: { [ZENN_ARTIFACT]: rendered },
        tokens: { input: generated.usage.inputTokens, output: generated.usage.outputTokens },
        costUsd: generated.costUsd,
        model: adapter.id,
        promptHash: tone.value.hash,
      };
    },
    async discard(ctx) {
      await deps.artifacts.remove(ctx.topic.slug, ctx.runId, ZENN_ARTIFACT);
    },
  };
}
