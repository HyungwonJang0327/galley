// 발행정보 단계(publishInfo) — 마지막 단계. 벨로그 본문(제목)·Zenn 원고(frontmatter)·근거 번들(포인터)을 DATA_DIR에서 읽어
// `publish.md`를 조립한다. 모델은 **소개(150자)·태그 하나에만** 쓴다(2026-09-26 사용자 결정 — 자리표시자 대신 모델 1회, 짧아
// 비용이 작다). 입력은 본문뿐이고 근거 번들·리포 경로는 프롬프트에 가지 않는다(근거 목록은 코드가 조립). posts/<슬러그>/에는
// 승인 시 복사한다(approvePublish). 썸네일은 B3b.
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import { stripSnippets } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { postFileNames } from '../publish/postFiles.ts';
import { stripTopicHints } from '../queue/normalizeTitle.ts';
import { WRITING_LIMITS, type WritingLimits } from './limits.ts';
import {
  PUBLISH_INTRO_MAX_CHARS,
  PUBLISH_TAGS_MAX,
  renderPublishInfo,
  type PublishInfoInput,
} from './publishInfo.ts';
import { stripSeriesLines } from './series.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { abortable, classifyModelError } from './writing.ts';
import { splitTitle, ZENN_ARTIFACT, ZENN_FRONTMATTER } from './zennStep.ts';

export interface PublishInfoStepDeps {
  store: EvidenceStore;
  artifacts: ArtifactStore;
  adapters: { get(id: string): ModelAdapter | undefined };
  limits?: WritingLimits;
}

/** 산출물 이름(DATA_DIR) — posts에서는 `<제목>_발행정보.md`(postFileNames). */
export const PUBLISH_ARTIFACT = 'publish.md';

const SYSTEM = `당신은 기술 블로그 발행 담당자입니다. 아래 벨로그 글을 읽고 발행 정보를 JSON 하나로만 답합니다.
- "intro": 글을 소개하는 한국어 한 문단, 공백 포함 ${PUBLISH_INTRO_MAX_CHARS}자 이내. 본문에 없는 사실을 더하지 않습니다.
- "tags": 벨로그 태그 3~${PUBLISH_TAGS_MAX}개(문자열 배열). 기술 이름은 널리 쓰는 표기, 나머지는 한국어. 회사·서비스 이름은 넣지 않습니다.
- 출력은 {"intro": "...", "tags": ["..."]} 형태의 JSON뿐이며 코드 펜스나 설명을 붙이지 않습니다.`;

/** 모델에 보내는 프롬프트 — 테스트용으로 공개. 본문은 상한까지만(소개·태그는 앞부분으로 충분). */
export function buildPublishInfoPrompt(
  input: { title: string; body: string },
  limits: WritingLimits = WRITING_LIMITS,
): { system: string; prompt: string } {
  const body =
    input.body.length > limits.publishInfoBodyChars
      ? `${input.body.slice(0, limits.publishInfoBodyChars)}\n\n(이하 생략)`
      : input.body;
  return { system: SYSTEM, prompt: `# 제목\n${input.title}\n\n# 본문\n${body}\n` };
}

/** 모델 출력 → 소개·태그. 형식이 어긋나면 undefined(호출부가 재시도 가능 실패로). 소개는 상한에서 자르고 태그는 정리·중복 제거. */
export function parsePublishInfoOutput(
  text: string,
): { intro: string; tags: string[] } | undefined {
  // 전체를 감싼 펜스는 정보 문자열이 무엇이든(json 등) 벗긴다 — writing.unwrapFence는 markdown만 받는다.
  const unfenced = /^(`{3,})\w*[ \t]*\n([\s\S]*?)\n\1\s*$/.exec(text.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse((unfenced === null ? text : unfenced[2]!).trim());
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { intro, tags } = parsed as Record<string, unknown>;
  if (typeof intro !== 'string' || !Array.isArray(tags)) return undefined;
  const cleanIntro = intro.replace(/\s+/g, ' ').trim();
  if (cleanIntro === '') return undefined;
  const seen = new Set<string>();
  const cleanTags: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const t = tag.replace(/\s+/g, ' ').trim();
    const key = t.toLowerCase();
    if (t === '' || seen.has(key)) continue;
    seen.add(key);
    cleanTags.push(t);
    if (cleanTags.length === PUBLISH_TAGS_MAX) break;
  }
  return {
    intro: Array.from(cleanIntro).slice(0, PUBLISH_INTRO_MAX_CHARS).join(''),
    tags: cleanTags,
  };
}

/**
 * Zenn 원고(`renderZennArticle` 출력)의 frontmatter에서 발행정보 Zenn 절 값을 읽는다. 값은 JSON 문자열(코드가 그렇게 썼다)이고
 * topics는 JSON 배열. 없거나 깨진 키는 고정값(ZENN_FRONTMATTER)으로 — 제목만은 필수라 없으면 undefined.
 */
export function parseZennFrontmatter(
  text: string,
): { title: string; emoji: string; type: string; topics: string[] } | undefined {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text.replace(/^﻿/, ''));
  if (m === null) return undefined;
  const fields = new Map<string, string>();
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*?)[ \t]*$/.exec(line);
    if (kv !== null) fields.set(kv[1]!, kv[2]!);
  }
  const asString = (raw: string | undefined): string | undefined => {
    if (raw === undefined) return undefined;
    try {
      const value: unknown = JSON.parse(raw);
      return typeof value === 'string' ? value : undefined;
    } catch {
      return raw === '' ? undefined : raw;
    }
  };
  const title = asString(fields.get('title'));
  if (title === undefined || title.trim() === '') return undefined;
  let topics: string[] = [...ZENN_FRONTMATTER.topics];
  try {
    const value: unknown = JSON.parse(fields.get('topics') ?? '[]');
    if (Array.isArray(value)) topics = value.filter((t): t is string => typeof t === 'string');
  } catch {
    /* 고정값 유지 */
  }
  return {
    title: title.trim(),
    emoji: asString(fields.get('emoji')) ?? ZENN_FRONTMATTER.emoji,
    type: asString(fields.get('type')) ?? ZENN_FRONTMATTER.type,
    topics,
  };
}

type Artifact = 'velog' | 'zenn';
const ARTIFACT_LABEL: Record<Artifact, { name: string; step: string; ko: string }> = {
  velog: { name: VELOG_ARTIFACT, step: 'velog', ko: '벨로그 본문' },
  zenn: { name: ZENN_ARTIFACT, step: 'zenn', ko: 'Zenn 원고' },
};

export function createPublishInfoStepRunner(deps: PublishInfoStepDeps): StepRunner {
  const limits = deps.limits ?? WRITING_LIMITS;

  /** 앞 단계 산출물 — carried면 그 결과를 만든 Run의 것(sources), 아니면 이 Run. 없으면 그 단계부터 다시. */
  async function readArtifact(ctx: StepContext, which: Artifact): Promise<string> {
    const label = ARTIFACT_LABEL[which];
    const read = await deps.artifacts.read(
      ctx.topic.slug,
      ctx.sources[which] ?? ctx.runId,
      label.name,
    );
    if (read.ok) return read.text;
    throw read.code === 'ARTIFACT_MISSING'
      ? new StepFailure(
          `PUBLISH_INFO_${which.toUpperCase()}_MISSING`,
          `${label.ko}이(가) 없습니다. ${label.ko} 단계부터 다시 실행하세요.`,
          false,
        )
      : new StepFailure(
          `PUBLISH_INFO_${which.toUpperCase()}_UNREADABLE`,
          `${label.ko}을(를) 읽지 못했습니다(DATA_DIR 권한을 확인하세요).`,
          false,
        );
  }

  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'publishInfo')
        throw new Error(`publishInfo 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅(BS5) 오류`);
      ctx.signal.throwIfAborted();
      if (ctx.series?.alreadyPublished === true)
        throw new StepFailure(
          'SERIES_EPISODE_ALREADY_PUBLISHED',
          '이미 발행된 시리즈 편((기존 글))이라 발행정보를 만들지 않습니다.',
          false,
        );

      const adapter = deps.adapters.get(ctx.modelId);
      if (adapter === undefined)
        throw new StepFailure(
          'PUBLISH_INFO_MODEL_UNKNOWN',
          '이 실행의 모델이 레지스트리에 없습니다.',
          false,
        );
      if (!adapter.available)
        throw new StepFailure(
          'PUBLISH_INFO_MODEL_UNAVAILABLE',
          '모델 API 키가 .env에 없습니다.',
          false,
        );

      // 벨로그 본문에서 글 제목 — 시리즈 표기(`| 시리즈명 N편`·인용 줄)는 뗀 것. H1이 없으면 힌트 뗀 주제 제목.
      const velogRaw = await readArtifact(ctx, 'velog');
      const velog = ctx.series === undefined ? velogRaw : stripSeriesLines(velogRaw, ctx.series);
      const { title, body } = splitTitle(velog, stripTopicHints(ctx.topic.title));
      if (body.trim() === '')
        throw new StepFailure(
          'PUBLISH_INFO_VELOG_EMPTY',
          '벨로그 본문이 비어 있어 발행정보를 만들지 않습니다. 벨로그 본문 단계부터 다시 실행하세요.',
          false,
        );

      const zenn = parseZennFrontmatter(await readArtifact(ctx, 'zenn'));
      if (zenn === undefined)
        throw new StepFailure(
          'PUBLISH_INFO_ZENN_INVALID',
          'Zenn 원고의 frontmatter를 읽지 못했습니다. Zenn 단계부터 다시 실행하세요.',
          false,
        );

      const bundle = await deps.store.read(ctx.topic.slug, ctx.sources.evidence ?? ctx.runId);
      if (!bundle.ok)
        throw new StepFailure(
          bundle.code === 'EVIDENCE_BUNDLE_MISSING'
            ? 'PUBLISH_INFO_EVIDENCE_MISSING'
            : 'PUBLISH_INFO_EVIDENCE_INVALID',
          bundle.code === 'EVIDENCE_BUNDLE_MISSING'
            ? '근거 묶음이 없습니다. 근거 수집 단계부터 다시 실행하세요.'
            : '근거 묶음을 읽지 못했습니다. 근거 수집 단계부터 다시 실행하세요.',
          false,
        );

      const { system, prompt } = buildPublishInfoPrompt({ title, body }, limits);
      ctx.signal.throwIfAborted();
      let generated: GenerateResult;
      try {
        generated = await abortable(
          adapter.generate({ system, prompt, maxOutputTokens: limits.publishInfoMaxOutputTokens }),
          ctx.signal,
        );
      } catch (error) {
        if (ctx.signal.aborted) throw error; // 워커가 끊은 것 — 실패가 아니라 중단
        throw classifyModelError(error, 'PUBLISH_INFO_MODEL_FAILED');
      }
      // 잘린 JSON은 어차피 못 읽는다 — 형식 오류와 같은 재시도 경로.
      const parsed = generated.truncated ? undefined : parsePublishInfoOutput(generated.text);
      if (parsed === undefined)
        throw new StepFailure(
          'PUBLISH_INFO_OUTPUT_INVALID',
          '모델이 소개·태그를 JSON으로 돌려주지 않았습니다.',
          true,
        );

      const input: PublishInfoInput = {
        title,
        slug: ctx.topic.slug,
        intro: parsed.intro,
        tags: parsed.tags,
        zenn,
        evidence: stripSnippets(bundle.bundle),
        thumbnailFile: postFileNames(title).thumbnail,
        ...(ctx.series === undefined ? {} : { series: ctx.series }),
      };
      const text = renderPublishInfo(input);
      try {
        await deps.artifacts.write(ctx.topic.slug, ctx.runId, PUBLISH_ARTIFACT, text);
      } catch (error) {
        throw new StepFailure(
          'PUBLISH_INFO_STORE_WRITE_FAILED',
          '발행정보를 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }
      return {
        artifacts: { [PUBLISH_ARTIFACT]: text },
        tokens: { input: generated.usage.inputTokens, output: generated.usage.outputTokens },
        costUsd: generated.costUsd,
        model: adapter.id,
      };
    },
    async discard(ctx) {
      await deps.artifacts.remove(ctx.topic.slug, ctx.runId, PUBLISH_ARTIFACT);
    },
  };
}
