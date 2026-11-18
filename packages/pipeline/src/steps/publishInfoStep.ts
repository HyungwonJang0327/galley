// 발행정보 단계(publishInfo) — 마지막 단계. 벨로그 본문(제목)·Zenn 원고(frontmatter)·근거 번들(포인터)을 DATA_DIR에서 읽어
// `publish.md`를 조립한다. 모델은 **소개(150자)·태그와 썸네일 값(제목 줄·알약·오른쪽 그림 조각)에만** 쓴다(2026-09-26 사용자
// 결정 — 자리표시자 대신 모델 1회. 그림 조각은 2026-11-19 RH3 ②). 입력은 본문뿐이고 근거 번들·리포 경로는 프롬프트에 가지 않는다(근거 목록은 코드가 조립). posts/<슬러그>/에는
// 승인 시 복사한다(approvePublish). 썸네일(`thumbnail.png`, B3b)도 여기서 만든다 — 같은 모델 호출이 제목 줄·부제·알약 태그를 주고
// ThumbnailRenderer(설치된 Chrome)가 찍는다. 썸네일 실패는 단계 실패다(2026-09-26 사용자 결정 — 5종이 다 있어야 승인 대기로).
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import { stripSnippets } from '../evidence/bundle.ts';
import type { EvidenceStore } from '../evidence/EvidenceStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import { postFileNames } from '../publish/postFiles.ts';
import {
  DEFAULT_THUMBNAIL_CONFIG,
  splitThumbnailTitle,
  THUMBNAIL_TAGS_MAX,
  THUMBNAIL_TITLE_LINE_CHARS,
  THUMBNAIL_TITLE_LINE_MAX_CHARS,
  THUMBNAIL_TITLE_MAX_LINES,
  type ThumbnailConfig,
  type ThumbnailRenderer,
} from '../publish/thumbnail.ts';
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
  thumbnails: ThumbnailRenderer;
  /** 브랜드 표기(.galley/thumbnail.json). 없으면 브랜드 줄 없음. */
  thumbnailConfig?: ThumbnailConfig;
  limits?: WritingLimits;
}

/** 산출물 이름(DATA_DIR) — posts에서는 `<제목>_발행정보.md`(postFileNames). */
export const PUBLISH_ARTIFACT = 'publish.md';
/** 썸네일 PNG(DATA_DIR) — posts에서는 `<제목>_썸네일.png`. */
export const THUMBNAIL_ARTIFACT = 'thumbnail.png';
/** 썸네일 부제 길이 상한(25px 두 줄 안팎). */
export const THUMBNAIL_SUBTITLE_MAX_CHARS = 40;
/** 썸네일 알약 태그 한 개 길이 상한 — 알약 하나가 왼쪽 틀(560px)을 넘지 않는 폭(여럿이면 줄바꿈). */
export const THUMBNAIL_TAG_MAX_CHARS = 24;
/** JSON과 그림 조각을 가르는 줄 — HTML을 JSON 문자열에 넣게 하면 따옴표 이스케이프에서 깨지기 쉬워 따로 받는다. */
export const THUMBNAIL_ART_MARKER = '===ART===';
/** 그림 조각 글자 수 상한 — 넘으면 조각을 버린다(오른쪽 빈 자리). 예시 조각이 4,000자 안팎이다. */
export const THUMBNAIL_ART_MAX_CHARS = 16_000;

const SYSTEM = `당신은 기술 블로그 발행 담당자입니다. 아래 벨로그 글을 읽고 발행 정보를 JSON 하나로만 답합니다.
- "intro": 글을 소개하는 한국어 한 문단, 공백 포함 ${PUBLISH_INTRO_MAX_CHARS}자 이내. 본문에 없는 사실을 더하지 않습니다.
- "tags": 벨로그 태그 3~${PUBLISH_TAGS_MAX}개(문자열 배열). 기술 이름은 널리 쓰는 표기, 나머지는 한국어. 회사·서비스 이름은 넣지 않습니다.
- "subtitle": 썸네일에 들어갈 한국어 부제 한 줄, ${THUMBNAIL_SUBTITLE_MAX_CHARS}자 이내. 제목을 되풀이하지 않고 글의 핵심을 한 문장으로.
- "thumbnailTitle": 썸네일 제목 줄(문자열 배열, 2~${THUMBNAIL_TITLE_MAX_LINES}줄). 글 제목을 뜻이 끊기지 않는 자리에서 나누고 괄호 부제는 뺍니다. 한 줄은 공백 포함 ${THUMBNAIL_TITLE_LINE_CHARS}자 안팎(최대 ${THUMBNAIL_TITLE_LINE_MAX_CHARS}자). 마지막 줄이 빨간 강조색으로 찍히므로 글의 핵심어가 마지막 줄에 오게 합니다.
- "thumbnailTags": 썸네일 알약 태그 2~${THUMBNAIL_TAGS_MAX}개(문자열 배열). 글의 핵심 기술 이름을 원어 표기로(예 "React", "zustand", "sessionStorage"), 각 ${THUMBNAIL_TAG_MAX_CHARS}자 이내. 회사·서비스 이름은 넣지 않습니다.
- 출력 형식: 먼저 {"intro": "...", "tags": ["..."], "subtitle": "...", "thumbnailTitle": ["...", "..."], "thumbnailTags": ["...", "..."]} 형태의 JSON 하나. 그다음 줄에 ${THUMBNAIL_ART_MARKER} 한 줄. 그 아래에 썸네일 오른쪽 그림 HTML 조각. 코드 펜스나 설명을 붙이지 않습니다.

[썸네일 오른쪽 그림 조각]
썸네일(1200×630) 오른쪽 580×630 박스에 들어갈 그림을 HTML 조각으로 씁니다. 이 글의 핵심 장면 하나를 UI 카드와 단순 도형으로 은유합니다(예: 두 목록이 합쳐지지 않는 장면, 요청이 한도에 막히는 장면, 파일이 여러 폴더로 갈리는 장면).
- 좌표는 박스 기준(left 0~580, top 0~630). 모든 요소는 position:absolute로 style에 left·top을 주고, 박스 밖으로 나가거나 서로 글자를 가리지 않게 합니다. 위아래 60px은 비워 둡니다.
- 쓸 수 있는 클래스: .card(흰 둥근 카드·그림자 포함·기본 폭 222px, style로 left/top/width/transform:rotate(±2~4deg)) · .card h3(카드 제목줄: 아이콘 SVG + 영문 소문자 라벨) · .row > .tile(64px 아이콘 타일) + .lines > .l1 .l2(회색 텍스트 바) · .chip(작은 회색 알약 라벨) · .dot-red(78px 빨간 원, 안에 흰 아이콘 SVG나 짧은 숫자) · .mono(모노 글꼴).
- 카드 2~3장 + 빨간 포인트(.dot-red 또는 #EC3B24 요소) 하나가 기본입니다. 강조는 빨강 하나만 씁니다.
- 연결선·화살표는 <svg style="position:absolute;left:..;top:.." width=".." height=".." fill="none"><path d=".." stroke="#C9CDD4" stroke-width="3" stroke-dasharray="7 7"/></svg>처럼 직접 그립니다.
- 아이콘은 단순 도형 인라인 SVG(viewBox="0 0 24 24", fill 또는 stroke)로 그립니다. 팔레트: 강조 #EC3B24 / 연한 강조 #F07C6A·#FFE9E6 / 아이콘 #5B6472 / 진한 선 #3A3E45 / 글자 #15171A / 보조 글자 #5A5F68 / 흐린 바 #E6E7EA / 연결선 #C9CDD4.
- 카드 안 글자는 짧은 라벨만(영문·숫자·코드 조각 위주, 한 줄 14자 이내). 본문 문장을 옮기지 않습니다.
- 쓸 수 있는 태그: div, span, p, b, small, h3, svg, g, path, circle, rect, ellipse, line, polyline, polygon, text. 속성은 class, style, SVG 도형 속성만. script, style 태그, img, a, 외부 주소(url(), http)는 쓰지 않습니다(걸러져 사라집니다).
- 사람 얼굴·손 같은 유기적 형태, 로고, 실제 서비스 화면, 회사명·서비스명·실제 도메인·키는 넣지 않습니다. 주소 예시는 mall-a.example처럼 일반 이름으로 씁니다.
- 분량은 4,000자 이내.

그림 조각 예시(다른 글의 것 — 구도와 키트 쓰는 법만 참고하고 내용은 이 글에 맞게 새로 그립니다):
<div class="card" style="left:36px;top:120px;width:250px;transform:rotate(-3deg)">
  <h3><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#2B2F36" stroke-width="2.4" stroke-linecap="round"><path d="M10 14 L14 10 M8 12 L6 14 Q3 17 6 19 Q8 21 11 18 L12 17 M16 12 L18 10 Q21 7 18 5 Q16 3 13 6 L12 7"/></svg>url</h3>
  <div class="row"><div class="tile"><svg viewBox="0 0 24 24" width="40" height="40" fill="#5B6472"><path d="M3 18 L9 10 L13 15 L16 12 L21 18 Z"/><circle cx="16" cy="7" r="2"/></svg></div><div class="lines"><span class="l1"></span><span class="l2"></span></div></div>
  <div style="margin-top:14px"><span class="chip">empty card</span></div>
</div>
<svg style="position:absolute;left:286px;top:210px" width="120" height="120" fill="none"><path d="M4 10 Q70 20 96 96" stroke="#C9CDD4" stroke-width="3" stroke-dasharray="7 7"/></svg>
<div class="card" style="left:300px;top:320px;width:240px;transform:rotate(2deg)">
  <h3><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#2B2F36" stroke-width="2.4"><rect x="4" y="5" width="16" height="6" rx="2"/><rect x="4" y="13" width="16" height="6" rx="2"/></svg>server</h3>
  <p class="mono" style="margin:0 0 10px;font-size:15px;color:#5A5F68">rate limit · 10 / min</p>
  <div style="height:14px;border-radius:7px;background:#EC3B24"></div>
</div>
<div class="dot-red" style="left:470px;top:270px"><span class="mono" style="color:#fff;font-size:24px;font-weight:500">429</span></div>`;

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

export interface PublishInfoOutput {
  intro: string;
  tags: string[];
  subtitle: string;
  /** 썸네일 제목 줄 — 모델이 안 줬거나 한 줄이 상한을 넘으면 빈 배열(호출부가 제목에서 기본 나누기). */
  thumbnailTitle: string[];
  /** 썸네일 알약 — 모델이 안 줬으면 발행 태그 앞에서 길이가 맞는 것. */
  thumbnailTags: string[];
  /** 썸네일 오른쪽 그림 조각(모델이 쓴 그대로 — 거르기는 렌더러가 한다). 없거나 상한을 넘으면 빈 문자열. */
  thumbnailArt: string;
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** 문자열 배열 정리 — 문자열만, 한 줄로, 빈 것·중복(대소문자 무시) 제거, 상한까지. */
function cleanList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = oneLine(item);
    const key = t.toLowerCase();
    if (t === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === max) break;
  }
  return out;
}

/** 전체를 감싼 펜스는 정보 문자열이 무엇이든(json·html 등) 벗긴다 — writing.unwrapFence는 markdown만 받는다. */
function unwrapAnyFence(text: string): string {
  const unfenced = /^(`{3,})\w*[ \t]*\n([\s\S]*?)\n\1\s*$/.exec(text.trim());
  return (unfenced === null ? text : unfenced[2]!).trim();
}

/**
 * 모델 출력 → 소개·태그·부제·썸네일 제목 줄·알약·그림 조각. 출력은 JSON, 구분 줄(`===ART===`), HTML 조각 순서 — 구분 줄이 없으면
 * 전체를 JSON으로 읽는다(그림 없음). 소개·태그 형식이 어긋나면 undefined(호출부가 재시도 가능 실패로). 소개는 상한에서 자르고
 * 태그는 정리·중복 제거. 부제는 없으면 소개 앞부분. 썸네일 값은 어긋나도 실패가 아니다 — 기본값으로 찍는다.
 */
export function parsePublishInfoOutput(text: string): PublishInfoOutput | undefined {
  const marker = new RegExp(`^[ \\t]*${THUMBNAIL_ART_MARKER}[ \\t]*$`, 'm').exec(text);
  const head = marker === null ? text : text.slice(0, marker.index);
  const rawArt = marker === null ? '' : unwrapAnyFence(text.slice(marker.index + marker[0].length));
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapAnyFence(head));
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { intro, tags, subtitle, thumbnailTitle, thumbnailTags } = parsed as Record<
    string,
    unknown
  >;
  if (typeof intro !== 'string' || !Array.isArray(tags)) return undefined;
  const cleanIntro = oneLine(intro);
  if (cleanIntro === '') return undefined;
  const rawSubtitle = typeof subtitle === 'string' ? oneLine(subtitle) : '';
  // 상한을 넘으면 39자 + 말줄임(문장 중간에서 뚝 끊기지 않게 — 리뷰 L4).
  const subtitleChars = Array.from(rawSubtitle === '' ? cleanIntro : rawSubtitle);
  const cleanSubtitle =
    subtitleChars.length > THUMBNAIL_SUBTITLE_MAX_CHARS
      ? `${subtitleChars.slice(0, THUMBNAIL_SUBTITLE_MAX_CHARS - 1).join('')}…`
      : subtitleChars.join('');
  const cleanTags = cleanList(tags, PUBLISH_TAGS_MAX);
  // 줄은 중복을 지우지 않는다(같은 낱말이 두 줄에 올 수 있다) — 문자열만, 한 줄로, 빈 줄 제거.
  const titleLines = Array.isArray(thumbnailTitle)
    ? thumbnailTitle
        .filter((line): line is string => typeof line === 'string')
        .map(oneLine)
        .filter((line) => line !== '')
    : [];
  const titleFits =
    titleLines.length > 0 &&
    titleLines.length <= THUMBNAIL_TITLE_MAX_LINES &&
    titleLines.every((line) => Array.from(line).length <= THUMBNAIL_TITLE_LINE_MAX_CHARS);
  const fitsPill = (tag: string): boolean => Array.from(tag).length <= THUMBNAIL_TAG_MAX_CHARS;
  const pills = cleanList(thumbnailTags, PUBLISH_TAGS_MAX).filter(fitsPill);
  return {
    intro: Array.from(cleanIntro).slice(0, PUBLISH_INTRO_MAX_CHARS).join(''),
    tags: cleanTags,
    subtitle: cleanSubtitle,
    thumbnailTitle: titleFits ? titleLines : [],
    thumbnailTags: (pills.length > 0 ? pills : cleanTags.filter(fitsPill)).slice(
      0,
      THUMBNAIL_TAGS_MAX,
    ),
    thumbnailArt: rawArt.length > THUMBNAIL_ART_MAX_CHARS ? '' : rawArt,
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

      // 썸네일을 찍을 수 있는지 **모델을 부르기 전에** — Chrome이 없으면 토큰을 쓰지 않고 바로 실패한다(리뷰 M4, 사용자 결정).
      const ready = await deps.thumbnails.check();
      if (!ready.ok)
        throw new StepFailure(
          ready.code,
          '썸네일을 찍을 Chrome을 찾지 못했습니다. .env의 GALLEY_CHROME에 실행 파일 경로를 적으세요.',
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

      // 썸네일 — 모델 출력의 제목 줄·부제·알약·그림 조각(렌더러가 거른다) + 설정의 브랜드 + 시리즈 배지. 실패는 단계 실패(Chrome 없음·깨짐은 재시도 불가, 제한 시간은 재시도).
      ctx.signal.throwIfAborted();
      const config = deps.thumbnailConfig ?? DEFAULT_THUMBNAIL_CONFIG;
      const rendered = await deps.thumbnails.render(
        {
          titleLines:
            parsed.thumbnailTitle.length > 0 ? parsed.thumbnailTitle : splitThumbnailTitle(title),
          subtitle: parsed.subtitle,
          tags: parsed.thumbnailTags,
          brand: config.brand,
          ...(parsed.thumbnailArt === '' ? {} : { artHtml: parsed.thumbnailArt }),
          ...(ctx.series === undefined
            ? {}
            : {
                series: {
                  name: ctx.series.name,
                  episodeNo: ctx.series.episodeNo,
                  total: ctx.series.total,
                },
              }),
        },
        ctx.signal,
      );
      if (!rendered.ok) {
        ctx.signal.throwIfAborted();
        throw new StepFailure(
          rendered.code,
          rendered.code === 'THUMBNAIL_CHROME_NOT_FOUND'
            ? '썸네일을 찍을 Chrome을 찾지 못했습니다. .env의 GALLEY_CHROME에 실행 파일 경로를 적으세요.'
            : rendered.code === 'THUMBNAIL_RENDER_TIMEOUT'
              ? '썸네일 렌더가 제한 시간 안에 끝나지 않았습니다.'
              : '썸네일을 만들지 못했습니다(Chrome 실행 실패).',
          rendered.code === 'THUMBNAIL_RENDER_TIMEOUT',
        );
      }

      try {
        await deps.artifacts.write(ctx.topic.slug, ctx.runId, PUBLISH_ARTIFACT, text);
        await deps.artifacts.writeBytes(
          ctx.topic.slug,
          ctx.runId,
          THUMBNAIL_ARTIFACT,
          rendered.png,
        );
      } catch (error) {
        throw new StepFailure(
          'PUBLISH_INFO_STORE_WRITE_FAILED',
          '발행정보·썸네일을 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }
      return {
        // 이진 산출물(썸네일)은 artifacts 맵(문자열)에 넣지 않는다 — DATA_DIR 파일이 진실이고 승인이 거기서 읽는다.
        artifacts: { [PUBLISH_ARTIFACT]: text },
        tokens: { input: generated.usage.inputTokens, output: generated.usage.outputTokens },
        costUsd: generated.costUsd,
        model: adapter.id,
      };
    },
    async discard(ctx) {
      await deps.artifacts.remove(ctx.topic.slug, ctx.runId, PUBLISH_ARTIFACT);
      await deps.artifacts.remove(ctx.topic.slug, ctx.runId, THUMBNAIL_ARTIFACT);
    },
  };
}
