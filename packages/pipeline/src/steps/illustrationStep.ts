// 삽화 단계(illustration) — Zenn 다음·발행정보 앞(decisions/illustrations.md, 2026-11-19 사용자 결정 "7번째 단계").
// 벨로그 본문의 삽화 자리 주석을 읽어 그 이름·개수대로 한국어 삽화 SVG를 그리고(모델 1회), 글자만 일본어로 바꾼 캡션판을
// 만든 뒤(모델 1회, 용어는 Zenn 기사에 맞춤) 둘 다 설치된 Chrome으로 PNG를 찍는다. 주석이 없는 글은 분량 규칙으로 장수를 정한다.
// 입력은 본문·Zenn 기사뿐이다 — 근거 번들·리포 경로는 프롬프트에 가지 않는다. 산출물은 DATA_DIR에만(posts 복사는 승인 때).
import type { ArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { GenerateResult, ModelAdapter } from '../model/ModelAdapter.ts';
import type { IllustrationRenderer } from '../publish/illustration.ts';
import {
  ILLUSTRATIONS_MANIFEST,
  ILLUSTRATIONS_MAX,
  buildIllustrationJaPrompt,
  buildIllustrationPrompt,
  illustrationArtifact,
  parseIllustrationOutput,
  planIllustrations,
  renderIllustrationManifest,
  type IllustrationDrawing,
  type IllustrationSlot,
} from './illustration.ts';
import { WRITING_LIMITS, type WritingLimits } from './limits.ts';
import { stripSeriesLines } from './series.ts';
import { StepFailure, type StepContext, type StepResult, type StepRunner } from './StepRunner.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { abortable, classifyModelError } from './writing.ts';
import { ZENN_ARTIFACT } from './zennStep.ts';

export interface IllustrationStepDeps {
  artifacts: ArtifactStore;
  adapters: { get(id: string): ModelAdapter | undefined };
  illustrations: IllustrationRenderer;
  limits?: WritingLimits;
}

type Source = 'velog' | 'zenn';
const SOURCE: Record<Source, { name: string; ko: string }> = {
  velog: { name: VELOG_ARTIFACT, ko: '벨로그 본문' },
  zenn: { name: ZENN_ARTIFACT, ko: 'Zenn 원고' },
};

export function createIllustrationStepRunner(deps: IllustrationStepDeps): StepRunner {
  const limits = deps.limits ?? WRITING_LIMITS;

  /** 앞 단계 산출물 — carried면 그 결과를 만든 Run의 것(sources), 아니면 이 Run. 없으면 그 단계부터 다시. */
  async function readSource(ctx: StepContext, which: Source): Promise<string> {
    const label = SOURCE[which];
    const read = await deps.artifacts.read(
      ctx.topic.slug,
      ctx.sources[which] ?? ctx.runId,
      label.name,
    );
    if (read.ok) return read.text;
    throw read.code === 'ARTIFACT_MISSING'
      ? new StepFailure(
          `ILLUSTRATION_${which.toUpperCase()}_MISSING`,
          `${label.ko}이(가) 없습니다. ${label.ko} 단계부터 다시 실행하세요.`,
          false,
        )
      : new StepFailure(
          `ILLUSTRATION_${which.toUpperCase()}_UNREADABLE`,
          `${label.ko}을(를) 읽지 못했습니다(DATA_DIR 권한을 확인하세요).`,
          false,
        );
  }

  /** 모델 한 번 — 잘림·형식 오류를 단계 실패로 옮기고 삽화 목록을 돌려준다. */
  async function draw(
    ctx: StepContext,
    adapter: ModelAdapter,
    request: { system: string; prompt: string },
    slots: readonly IllustrationSlot[],
    lang: '한국어' | '일본어',
  ): Promise<{ drawings: IllustrationDrawing[]; generated: GenerateResult }> {
    ctx.signal.throwIfAborted();
    let generated: GenerateResult;
    try {
      generated = await abortable(
        adapter.generate({ ...request, maxOutputTokens: limits.illustrationMaxOutputTokens }),
        ctx.signal,
      );
    } catch (error) {
      if (ctx.signal.aborted) throw error; // 워커가 끊은 것 — 실패가 아니라 중단
      throw classifyModelError(error, 'ILLUSTRATION_MODEL_FAILED');
    }
    if (generated.truncated)
      throw new StepFailure(
        'ILLUSTRATION_OUTPUT_TRUNCATED',
        `${lang} 삽화가 출력 상한에서 잘렸습니다. 출력 상한을 올리거나 수정 지시로 그림을 단순하게 하세요.`,
        false,
      );
    const drawings = parseIllustrationOutput(generated.text.replace(/\r\n/g, '\n'), slots);
    if (drawings === undefined)
      throw new StepFailure(
        'ILLUSTRATION_OUTPUT_INVALID',
        `모델이 ${lang} 삽화 ${slots.length}장을 정해진 형식(구분 줄 + SVG)으로 돌려주지 않았습니다.`,
        true,
      );
    return { drawings, generated };
  }

  return {
    async run(ctx: StepContext): Promise<StepResult> {
      if (ctx.step !== 'illustration')
        throw new Error(`illustration 단계 러너에 ${ctx.step} 단계가 들어왔다 — 라우팅 오류`);
      ctx.signal.throwIfAborted();

      // `(기존 글)` 편은 본문을 쓰지 않는다 — 본문 단계가 이미 막지만 삽화부터 재실행하는 길도 같은 코드로 막는다.
      if (ctx.series?.alreadyPublished === true)
        throw new StepFailure(
          'SERIES_EPISODE_ALREADY_PUBLISHED',
          '이미 발행된 시리즈 편((기존 글))이라 삽화를 만들지 않습니다.',
          false,
        );

      const adapter = deps.adapters.get(ctx.modelId);
      if (adapter === undefined)
        throw new StepFailure(
          'ILLUSTRATION_MODEL_UNKNOWN',
          '이 실행의 모델이 레지스트리에 없습니다.',
          false,
        );
      if (!adapter.available)
        throw new StepFailure(
          'ILLUSTRATION_MODEL_UNAVAILABLE',
          '모델 API 키가 .env에 없습니다.',
          false,
        );

      const velogRaw = await readSource(ctx, 'velog');
      const zenn = await readSource(ctx, 'zenn');
      const body = (
        ctx.series === undefined ? velogRaw : stripSeriesLines(velogRaw, ctx.series)
      ).trim();
      if (body === '')
        throw new StepFailure(
          'ILLUSTRATION_BODY_EMPTY',
          '벨로그 본문이 비어 있어 삽화를 만들지 않습니다. 벨로그 본문 단계부터 다시 실행하세요.',
          false,
        );

      // 찍을 수 있는지 **모델을 부르기 전에** — Chrome이 없으면 토큰을 쓰지 않고 바로 실패한다(썸네일과 같은 규칙).
      const ready = await deps.illustrations.check();
      if (!ready.ok)
        throw new StepFailure(
          'ILLUSTRATION_CHROME_NOT_FOUND',
          '삽화를 찍을 Chrome을 찾지 못했습니다. .env의 GALLEY_CHROME에 실행 파일 경로를 적으세요.',
          false,
        );

      const slots = planIllustrations(body);
      const ko = await draw(
        ctx,
        adapter,
        buildIllustrationPrompt(
          {
            body,
            slots,
            ...(ctx.instruction !== undefined ? { instruction: ctx.instruction } : {}),
          },
          limits,
        ),
        slots,
        '한국어',
      );
      // 일본어판은 한국어판의 이름·번호를 그대로 — 글자만 바꾼다.
      const named: IllustrationSlot[] = ko.drawings.map((d) => ({ n: d.n, name: d.name }));
      const ja = await draw(
        ctx,
        adapter,
        buildIllustrationJaPrompt({ drawings: ko.drawings, zenn }, limits),
        named,
        '일본어',
      );

      // 렌더 — 한 장씩(Chrome을 동시에 여럿 띄우지 않는다). 실패는 단계 실패(제한 시간만 재시도).
      const pngs: { name: string; bytes: Uint8Array }[] = [];
      for (const [lang, drawings] of [
        ['ko', ko.drawings],
        ['ja', ja.drawings],
      ] as const)
        for (const drawing of drawings) {
          ctx.signal.throwIfAborted();
          const rendered = await deps.illustrations.render(drawing.svg, lang, ctx.signal);
          if (!rendered.ok) {
            ctx.signal.throwIfAborted();
            throw rendered.code === 'THUMBNAIL_CHROME_NOT_FOUND'
              ? new StepFailure(
                  'ILLUSTRATION_CHROME_NOT_FOUND',
                  '삽화를 찍을 Chrome을 찾지 못했습니다. .env의 GALLEY_CHROME에 실행 파일 경로를 적으세요.',
                  false,
                )
              : rendered.code === 'THUMBNAIL_RENDER_TIMEOUT'
                ? new StepFailure(
                    'ILLUSTRATION_RENDER_TIMEOUT',
                    '삽화 렌더가 제한 시간 안에 끝나지 않았습니다.',
                    true,
                  )
                : new StepFailure(
                    'ILLUSTRATION_RENDER_FAILED',
                    '삽화를 찍지 못했습니다(Chrome 실행 오류).',
                    false,
                    { cause: new Error(rendered.detail) },
                  );
          }
          pngs.push({ name: illustrationArtifact(drawing.n, lang, 'png'), bytes: rendered.png });
        }

      const manifest = renderIllustrationManifest(ko.drawings, slots);
      const { slug } = ctx.topic;
      try {
        for (const [lang, drawings] of [
          ['ko', ko.drawings],
          ['ja', ja.drawings],
        ] as const)
          for (const drawing of drawings)
            await deps.artifacts.write(
              slug,
              ctx.runId,
              illustrationArtifact(drawing.n, lang, 'svg'),
              `${drawing.svg}\n`,
            );
        for (const png of pngs)
          await deps.artifacts.writeBytes(slug, ctx.runId, png.name, png.bytes);
        // 목록은 맨 마지막 — 목록이 있으면 그 안의 그림은 전부 있다.
        await deps.artifacts.write(slug, ctx.runId, ILLUSTRATIONS_MANIFEST, manifest);
      } catch (error) {
        throw new StepFailure(
          'ILLUSTRATION_STORE_WRITE_FAILED',
          '삽화를 저장하지 못했습니다(DATA_DIR 설정·권한·용량을 확인하세요).',
          false,
          { cause: error },
        );
      }

      return {
        artifacts: { [ILLUSTRATIONS_MANIFEST]: manifest },
        tokens: {
          input: ko.generated.usage.inputTokens + ja.generated.usage.inputTokens,
          output: ko.generated.usage.outputTokens + ja.generated.usage.outputTokens,
        },
        costUsd: ko.generated.costUsd + ja.generated.costUsd,
        model: adapter.id,
      };
    },
    async discard(ctx) {
      await discardIllustrations(deps.artifacts, ctx.topic.slug, ctx.runId);
    },
  };
}

/** 이 Run의 삽화 산출물을 전부 지운다(없어도 조용히) — 번호 고정 이름이라 목록 파일 없이도 찾는다. */
export async function discardIllustrations(
  artifacts: ArtifactStore,
  slug: string,
  runId: string,
): Promise<void> {
  await artifacts.remove(slug, runId, ILLUSTRATIONS_MANIFEST);
  for (let n = 1; n <= ILLUSTRATIONS_MAX; n += 1)
    for (const lang of ['ko', 'ja'] as const)
      for (const ext of ['svg', 'png'] as const)
        await artifacts.remove(slug, runId, illustrationArtifact(n, lang, ext));
}
