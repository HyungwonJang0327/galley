// 모델은 스크립트 어댑터, 렌더러는 가짜(Chrome 없음), 산출물은 임시 DATA_DIR. DB 없음.
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import type { IllustrationRenderer } from '../publish/illustration.ts';
import { ILLUSTRATIONS_MANIFEST, parseIllustrationManifest } from './illustration.ts';
import { createIllustrationStepRunner } from './illustrationStep.ts';
import type { SeriesStepInfo } from './series.ts';
import type { StepContext } from './StepRunner.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { renderZennArticle, ZENN_ARTIFACT } from './zennStep.ts';

let dir: string;
let artifacts: LocalFsArtifactStore;

const SLUG = 'infinite-scroll';
const VELOG = [
  '# 무한 스크롤 미리 불러오기',
  '',
  '피드 끝에서 다음 페이지를 미리 읽는다.',
  '<!-- [삽화] illust1_observer.png — 여기: 서론 다음, "## 1." 앞 -->',
  '## 1. 관찰자',
  '<!-- [삽화] illust2_cursor.png — 여기: 코드 다음 -->',
  '',
].join('\n');
const ZENN = renderZennArticle('無限スクロールの先読み', '## はじめに\n\n本文。\n');
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

const svg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="520" viewBox="0 0 1200 520"><text x="600" y="490">${label}</text></svg>`;
const KO_OUTPUT = `===ILLUST 1: observer===\n${svg('관찰자')}\n===ILLUST 2: cursor===\n${svg('커서')}`;
const JA_OUTPUT = `===ILLUST 1: observer===\n${svg('オブザーバー')}\n===ILLUST 2: cursor===\n${svg('カーソル')}`;

type RenderResult = Awaited<ReturnType<IllustrationRenderer['render']>>;
function fakeRenderer(result?: RenderResult) {
  const calls: { svg: string; lang: string }[] = [];
  const renderer: IllustrationRenderer & { calls: typeof calls } = {
    calls,
    async check() {
      return result !== undefined && !result.ok && result.code === 'THUMBNAIL_CHROME_NOT_FOUND'
        ? { ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' }
        : { ok: true };
    },
    async render(input, lang) {
      calls.push({ svg: input, lang });
      return result ?? { ok: true, png: PNG };
    },
  };
  return renderer;
}

function ctx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    runId: 'run_1',
    step: 'illustration',
    topic: { id: 't1', title: '무한 스크롤', slug: SLUG },
    modelId: 'mock:scripted',
    sources: {},
    signal: new AbortController().signal,
    ...overrides,
  };
}

const twoCalls = () => createScriptedAdapter((_input, i) => (i === 0 ? KO_OUTPUT : JA_OUTPUT));
const NAMES = [
  'illust1.svg',
  'illust1.png',
  'illust1_ja.svg',
  'illust1_ja.png',
  'illust2.svg',
  'illust2.png',
  'illust2_ja.svg',
  'illust2_ja.png',
];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-illust-step-'));
  artifacts = new LocalFsArtifactStore(dir);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await artifacts.write(SLUG, 'run_1', VELOG_ARTIFACT, VELOG);
  await artifacts.write(SLUG, 'run_1', ZENN_ARTIFACT, ZENN);
  // 앞 테스트가 만든 산출물이 남지 않게.
  for (const name of [...NAMES, ILLUSTRATIONS_MANIFEST])
    await artifacts.remove(SLUG, 'run_1', name);
});

describe('createIllustrationStepRunner', () => {
  test('본문 자리 주석대로 한국어·일본어 삽화를 그려 SVG·PNG·목록을 DATA_DIR에 쓴다', async () => {
    const adapter = twoCalls();
    const illustrations = fakeRenderer();
    const runner = createIllustrationStepRunner({
      artifacts,
      adapters: { get: () => adapter },
      illustrations,
    });

    const result = await runner.run(ctx({ instruction: '2번을 단순하게' }));

    // 모델 2회: 한국어(본문 + 목록 + 수정 지시) → 일본어(한국어 SVG + Zenn 기사).
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0]!.prompt).toContain(
      '- 1번: illust1_observer — 자리: 서론 다음, "## 1." 앞',
    );
    expect(adapter.calls[0]!.prompt).toContain('2번을 단순하게');
    expect(adapter.calls[0]!.prompt).toContain('피드 끝에서 다음 페이지를 미리 읽는다.');
    expect(adapter.calls[1]!.prompt).toContain(svg('관찰자'));
    expect(adapter.calls[1]!.prompt).toContain('無限スクロールの先読み');
    expect(adapter.calls[1]!.prompt).not.toContain('2번을 단순하게');

    // 렌더 4장: 한국어 둘, 일본어 둘.
    expect(illustrations.calls.map((c) => c.lang)).toEqual(['ko', 'ko', 'ja', 'ja']);
    expect(illustrations.calls[2]!.svg).toBe(svg('オブザーバー'));

    for (const name of NAMES.filter((n) => n.endsWith('.png')))
      expect(await artifacts.readBytes(SLUG, 'run_1', name)).toEqual({ ok: true, bytes: PNG });
    expect(await artifacts.read(SLUG, 'run_1', 'illust2_ja.svg')).toEqual({
      ok: true,
      text: `${svg('カーソル')}\n`,
    });
    const manifest = await artifacts.read(SLUG, 'run_1', ILLUSTRATIONS_MANIFEST);
    expect(manifest.ok && parseIllustrationManifest(manifest.text)?.items).toEqual([
      { n: 1, name: 'illust1_observer', where: '서론 다음, "## 1." 앞' },
      { n: 2, name: 'illust2_cursor', where: '코드 다음' },
    ]);

    // 토큰·비용은 두 호출의 합, 모델 id 기록.
    expect(Object.keys(result.artifacts)).toEqual([ILLUSTRATIONS_MANIFEST]);
    expect(result.costUsd).toBeCloseTo(0.002);
    expect(result.tokens?.input).toBe(
      Math.ceil(adapter.calls[0]!.prompt.length / 4) +
        Math.ceil(adapter.calls[1]!.prompt.length / 4),
    );
    expect(result.model).toBe('mock:scripted');
  });

  test('자리 주석이 없는 본문은 분량 규칙으로 장수를 정하고 모델의 설명으로 이름을 만든다', async () => {
    await artifacts.write(SLUG, 'run_1', VELOG_ARTIFACT, '# 제목\n\n짧은 본문.\n');
    const one = `===ILLUST 1: 사건 장면===\n${svg('하나')}`;
    const adapter = createScriptedAdapter(() => one);
    await createIllustrationStepRunner({
      artifacts,
      adapters: { get: () => adapter },
      illustrations: fakeRenderer(),
    }).run(ctx());
    const manifest = await artifacts.read(SLUG, 'run_1', ILLUSTRATIONS_MANIFEST);
    expect(manifest.ok && parseIllustrationManifest(manifest.text)?.items).toEqual([
      { n: 1, name: 'illust1_사건_장면' },
    ]);
    expect(adapter.calls[0]!.prompt).toContain('삽화 1장을 그립니다.');
  });

  test('본문·Zenn이 carried면 출처 Run의 것을 읽는다', async () => {
    await artifacts.write(
      SLUG,
      'run_0',
      VELOG_ARTIFACT,
      '# 옛 본문\n\n<!-- [삽화] illust1_old.png -->\n',
    );
    await artifacts.write(SLUG, 'run_0', ZENN_ARTIFACT, ZENN);
    const adapter = createScriptedAdapter(() => `===ILLUST 1: old===\n${svg('옛')}`);
    await createIllustrationStepRunner({
      artifacts,
      adapters: { get: () => adapter },
      illustrations: fakeRenderer(),
    }).run(ctx({ sources: { velog: 'run_0', zenn: 'run_0' } }));
    expect(adapter.calls[0]!.prompt).toContain('- 1번: illust1_old');
    // 쓰는 곳은 이 Run.
    expect((await artifacts.readBytes(SLUG, 'run_1', 'illust1.png')).ok).toBe(true);
  });

  test('Chrome이 없으면 모델을 부르지 않고 실패한다', async () => {
    const adapter = twoCalls();
    const runner = createIllustrationStepRunner({
      artifacts,
      adapters: { get: () => adapter },
      illustrations: fakeRenderer({ ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' }),
    });
    await expect(runner.run(ctx())).rejects.toMatchObject({
      code: 'ILLUSTRATION_CHROME_NOT_FOUND',
      retryable: false,
    });
    expect(adapter.calls).toHaveLength(0);
  });

  test.each([
    [
      { ok: false, code: 'THUMBNAIL_RENDER_TIMEOUT', detail: 't' },
      'ILLUSTRATION_RENDER_TIMEOUT',
      true,
    ],
    [
      { ok: false, code: 'THUMBNAIL_RENDER_FAILED', detail: 'x' },
      'ILLUSTRATION_RENDER_FAILED',
      false,
    ],
  ] as const)('렌더 실패는 단계 실패 — %o → %s', async (rendered, code, retryable) => {
    const runner = createIllustrationStepRunner({
      artifacts,
      adapters: { get: () => twoCalls() },
      illustrations: fakeRenderer(rendered),
    });
    await expect(runner.run(ctx())).rejects.toMatchObject({ code, retryable });
    // 아무것도 쓰지 않는다.
    expect((await artifacts.read(SLUG, 'run_1', ILLUSTRATIONS_MANIFEST)).ok).toBe(false);
    expect((await artifacts.read(SLUG, 'run_1', 'illust1.svg')).ok).toBe(false);
  });

  test('모델이 장수를 못 채우면 재시도 가능 실패, 일본어판에서 어긋나도 같다', async () => {
    const short = createScriptedAdapter(() => `===ILLUST 1: a===\n${svg('하나')}`);
    await expect(
      createIllustrationStepRunner({
        artifacts,
        adapters: { get: () => short },
        illustrations: fakeRenderer(),
      }).run(ctx()),
    ).rejects.toMatchObject({ code: 'ILLUSTRATION_OUTPUT_INVALID', retryable: true });

    const jaBroken = createScriptedAdapter((_input, i) => (i === 0 ? KO_OUTPUT : '죄송합니다'));
    const illustrations = fakeRenderer();
    await expect(
      createIllustrationStepRunner({
        artifacts,
        adapters: { get: () => jaBroken },
        illustrations,
      }).run(ctx()),
    ).rejects.toMatchObject({ code: 'ILLUSTRATION_OUTPUT_INVALID', retryable: true });
    expect(illustrations.calls).toHaveLength(0);
  });

  test('출력이 잘리면 재시도 불가 실패', async () => {
    const adapter = twoCalls();
    const generate = adapter.generate.bind(adapter);
    adapter.generate = async (input) => ({ ...(await generate(input)), truncated: true });
    await expect(
      createIllustrationStepRunner({
        artifacts,
        adapters: { get: () => adapter },
        illustrations: fakeRenderer(),
      }).run(ctx()),
    ).rejects.toMatchObject({ code: 'ILLUSTRATION_OUTPUT_TRUNCATED', retryable: false });
  });

  test.each([
    [VELOG_ARTIFACT, 'ILLUSTRATION_VELOG_MISSING'],
    [ZENN_ARTIFACT, 'ILLUSTRATION_ZENN_MISSING'],
  ])('앞 단계 산출물 %s이 없으면 모델을 부르지 않는다', async (name, code) => {
    await artifacts.remove(SLUG, 'run_1', name);
    const adapter = twoCalls();
    await expect(
      createIllustrationStepRunner({
        artifacts,
        adapters: { get: () => adapter },
        illustrations: fakeRenderer(),
      }).run(ctx()),
    ).rejects.toMatchObject({ code, retryable: false });
    expect(adapter.calls).toHaveLength(0);
  });

  test('모델이 없거나 키가 없으면, (기존 글) 편이면 실패', async () => {
    const deps = { artifacts, illustrations: fakeRenderer() };
    await expect(
      createIllustrationStepRunner({ ...deps, adapters: { get: () => undefined } }).run(ctx()),
    ).rejects.toMatchObject({ code: 'ILLUSTRATION_MODEL_UNKNOWN' });
    const unavailable = { ...twoCalls(), available: false };
    await expect(
      createIllustrationStepRunner({ ...deps, adapters: { get: () => unavailable } }).run(ctx()),
    ).rejects.toMatchObject({ code: 'ILLUSTRATION_MODEL_UNAVAILABLE' });
    const series: SeriesStepInfo = { name: 'S', episodeNo: 1, total: 1, alreadyPublished: true };
    await expect(
      createIllustrationStepRunner({ ...deps, adapters: { get: () => twoCalls() } }).run(
        ctx({ series }),
      ),
    ).rejects.toMatchObject({ code: 'SERIES_EPISODE_ALREADY_PUBLISHED' });
  });

  test('discard는 이 Run의 삽화 산출물을 전부 지운다', async () => {
    const runner = createIllustrationStepRunner({
      artifacts,
      adapters: { get: () => twoCalls() },
      illustrations: fakeRenderer(),
    });
    await runner.run(ctx());
    await runner.discard?.(ctx());
    for (const name of [...NAMES, ILLUSTRATIONS_MANIFEST])
      expect((await artifacts.read(SLUG, 'run_1', name)).ok, name).toBe(false);
    // 다른 단계 산출물은 그대로.
    expect((await artifacts.read(SLUG, 'run_1', VELOG_ARTIFACT)).ok).toBe(true);
  });
});
