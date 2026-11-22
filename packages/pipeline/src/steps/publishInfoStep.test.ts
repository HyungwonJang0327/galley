// 모델은 스크립트 어댑터, 번들·산출물은 임시 DATA_DIR. DB 없음.
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceBundle } from '../evidence/bundle.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { ILLUSTRATIONS_MANIFEST } from './illustration.ts';
import { WRITING_LIMITS } from './limits.ts';
import {
  buildPublishInfoPrompt,
  createPublishInfoStepRunner,
  parsePublishInfoOutput,
  parseZennFrontmatter,
  PUBLISH_ARTIFACT,
  THUMBNAIL_ARTIFACT,
  THUMBNAIL_ART_MARKER,
  THUMBNAIL_ART_MAX_CHARS,
} from './publishInfoStep.ts';
import type { SeriesStepInfo } from './series.ts';
import type { StepContext } from './StepRunner.ts';
import type { ThumbnailInput, ThumbnailRenderer } from '../publish/thumbnail.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { renderZennArticle, ZENN_ARTIFACT } from './zennStep.ts';

let dir: string;
let store: LocalFsEvidenceStore;
let artifacts: LocalFsArtifactStore;

const BUNDLE: EvidenceBundle = {
  version: 1,
  runId: 'run_1',
  topicId: 't1',
  topicSlug: 'infinite-scroll',
  collectedAt: '2026-09-26T00:00:00.000Z',
  items: [
    {
      analysisId: 'a1',
      commit: 'abcdef1234567',
      path: 'src/scroll.ts',
      lineRange: { start: 10, end: 12 },
      date: '2024-03-05T10:00:00+09:00',
      note: '다음 페이지 미리 읽기',
      source: 'linked',
      redacted: true,
      truncated: false,
      snippet: 'const SECRET_SNIPPET = new IntersectionObserver(load);',
    },
  ],
  analyses: [{ id: 'a1', kind: 'area', title: 'src 영역', summary: '스크롤 모듈.' }],
  unreadable: 0,
  filtered: true,
};

const VELOG = '# 무한 스크롤 미리 불러오기\n\n## 배경\n\n피드 끝에서 다음 페이지를 미리 읽는다.\n';
const ZENN = renderZennArticle('無限スクロールの先読み', '## はじめに\n\n本文。\n');
const GOOD_OUTPUT = JSON.stringify({
  intro: '피드 끝에 닿기 전에 다음 페이지를 불러온 이야기.',
  tags: ['React', ' 무한스크롤 ', 'react', ''],
  subtitle: '끝에 닿기 전에 다음 페이지를',
  thumbnailTitle: ['무한 스크롤', ' 미리 ', '불러오기'],
  thumbnailTags: ['React', 'IntersectionObserver'],
});
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

/** 렌더 입력을 기록하는 가짜 렌더러(Chrome 없음). */
function fakeThumbnails(result?: Awaited<ReturnType<ThumbnailRenderer['render']>>) {
  const calls: ThumbnailInput[] = [];
  const renderer: ThumbnailRenderer & { calls: ThumbnailInput[] } = {
    calls,
    async check() {
      return result !== undefined && !result.ok && result.code === 'THUMBNAIL_CHROME_NOT_FOUND'
        ? { ok: false, code: 'THUMBNAIL_CHROME_NOT_FOUND' }
        : { ok: true };
    },
    async render(input) {
      calls.push(input);
      return result ?? { ok: true, png: PNG };
    },
  };
  return renderer;
}

function ctx(overrides: Partial<StepContext> = {}): StepContext {
  return {
    runId: 'run_1',
    step: 'publishInfo',
    topic: { id: 't1', title: '무한 스크롤 (spacehome)', slug: 'infinite-scroll' },
    modelId: 'mock:scripted',
    sources: {},
    signal: new AbortController().signal,
    ...overrides,
  };
}

type Deps = Parameters<typeof createPublishInfoStepRunner>[0];
/** 가짜 렌더러를 기본으로 끼운다 — 썸네일이 주제인 테스트만 바꿔 끼운다. */
const runnerWith = (deps: Omit<Deps, 'thumbnails'> & Partial<Pick<Deps, 'thumbnails'>>) =>
  createPublishInfoStepRunner({ thumbnails: fakeThumbnails(), ...deps });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-publish-info-'));
  store = new LocalFsEvidenceStore(join(dir, 'data'));
  artifacts = new LocalFsArtifactStore(join(dir, 'data'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await store.write(BUNDLE);
  await artifacts.write('infinite-scroll', 'run_1', VELOG_ARTIFACT, VELOG);
  await artifacts.write('infinite-scroll', 'run_1', ZENN_ARTIFACT, ZENN);
  // 앞 테스트가 만든 산출물이 남지 않게 — "쓰지 않는다" 단언이 진짜가 되도록.
  await artifacts.remove('infinite-scroll', 'run_1', PUBLISH_ARTIFACT);
  await artifacts.remove('infinite-scroll', 'run_1', THUMBNAIL_ARTIFACT);
});

describe('parsePublishInfoOutput', () => {
  test('JSON을 읽어 소개는 공백 정리, 태그는 정리·중복(대소문자) 제거·빈 것 제외', () => {
    expect(parsePublishInfoOutput(GOOD_OUTPUT)).toEqual({
      intro: '피드 끝에 닿기 전에 다음 페이지를 불러온 이야기.',
      tags: ['React', '무한스크롤'],
      subtitle: '끝에 닿기 전에 다음 페이지를',
      thumbnailTitle: ['무한 스크롤', '미리', '불러오기'],
      thumbnailTags: ['React', 'IntersectionObserver'],
      thumbnailArt: '',
    });
  });

  test('코드 펜스로 감싼 JSON도 읽는다', () => {
    expect(parsePublishInfoOutput('```json\n{"intro":"소개","tags":["a"]}\n```')).toEqual({
      intro: '소개',
      tags: ['a'],
      subtitle: '소개',
      thumbnailTitle: [],
      thumbnailTags: ['a'],
      thumbnailArt: '',
    });
  });

  test('부제는 40자에서 자르고 없으면 소개 앞부분', () => {
    const out = parsePublishInfoOutput(
      JSON.stringify({ intro: '소개', tags: [], subtitle: '가'.repeat(50) }),
    );
    expect(out?.subtitle).toBe(`${'가'.repeat(39)}…`);
  });

  test('썸네일 제목 줄 — 4줄 이상이거나 한 줄이 13자를 넘으면 빈 배열(호출부가 기본 나누기)', () => {
    const titleOf = (thumbnailTitle: unknown) =>
      parsePublishInfoOutput(JSON.stringify({ intro: '소개', tags: [], thumbnailTitle }))
        ?.thumbnailTitle;
    expect(titleOf(['가', '가', '끝'])).toEqual(['가', '가', '끝']);
    expect(titleOf(['1', '2', '3', '4'])).toEqual([]);
    expect(titleOf(['가'.repeat(14)])).toEqual([]);
    expect(titleOf(['가'.repeat(13), 1, ' '])).toEqual(['가'.repeat(13)]);
    expect(titleOf('한 줄')).toEqual([]);
  });

  test('구분 줄 아래는 그림 조각 — 그대로 돌려주고(거르기는 렌더러), 펜스는 벗기고, 상한을 넘으면 버린다', () => {
    const json = JSON.stringify({ intro: '소개', tags: ['a'] });
    const art = '<div class="card" style="left:10px;top:20px">a</div>';
    expect(parsePublishInfoOutput(`${json}\n${THUMBNAIL_ART_MARKER}\n${art}\n`)).toMatchObject({
      intro: '소개',
      thumbnailArt: art,
    });
    expect(
      parsePublishInfoOutput(
        `\`\`\`json\n${json}\n\`\`\`\n ${THUMBNAIL_ART_MARKER} \n\`\`\`html\n${art}\n\`\`\``,
      )?.thumbnailArt,
    ).toBe(art);
    expect(
      parsePublishInfoOutput(
        `${json}\n${THUMBNAIL_ART_MARKER}\n${'x'.repeat(THUMBNAIL_ART_MAX_CHARS + 1)}`,
      )?.thumbnailArt,
    ).toBe('');
    // 구분 줄 위 JSON이 깨졌으면 그림이 있어도 형식 오류.
    expect(parsePublishInfoOutput(`{ nope\n${THUMBNAIL_ART_MARKER}\n${art}`)).toBeUndefined();
  });

  test('썸네일 알약 — 최대 3개·24자 이내, 없으면 발행 태그 앞에서 길이가 맞는 것', () => {
    const pillsOf = (extra: Record<string, unknown>) =>
      parsePublishInfoOutput(JSON.stringify({ intro: '소개', ...extra }))?.thumbnailTags;
    expect(pillsOf({ tags: ['x'], thumbnailTags: ['a', 'A', 'b', 'c', 'd'] })).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(pillsOf({ tags: ['x'.repeat(25), 'React', '상태 관리'], thumbnailTags: [] })).toEqual([
      'React',
      '상태 관리',
    ]);
    expect(pillsOf({ tags: ['React'], thumbnailTags: ['y'.repeat(25)] })).toEqual(['React']);
  });

  test('소개는 150자에서 자르고 태그는 10개까지', () => {
    const out = parsePublishInfoOutput(
      JSON.stringify({
        intro: '가'.repeat(200),
        tags: Array.from({ length: 15 }, (_, i) => `t${i}`),
      }),
    );
    expect(out?.intro).toHaveLength(150);
    expect(out?.tags).toHaveLength(10);
  });

  test.each([
    ['JSON 아님', '소개: ...'],
    ['intro 없음', '{"tags":["a"]}'],
    ['tags가 배열 아님', '{"intro":"x","tags":"a"}'],
    ['intro 빈 문자열', '{"intro":"  ","tags":[]}'],
    ['배열', '[]'],
  ])('%s → undefined', (_label, text) => {
    expect(parsePublishInfoOutput(text)).toBeUndefined();
  });
});

describe('parseZennFrontmatter', () => {
  test('renderZennArticle 출력과 왕복 — 제목·emoji·type·빈 topics', () => {
    expect(parseZennFrontmatter(ZENN)).toEqual({
      title: '無限スクロールの先読み',
      emoji: '📝',
      type: 'tech',
      topics: [],
    });
  });

  test('topics가 있으면 배열로, 따옴표 없는 값·BOM·CRLF도 읽는다', () => {
    const text =
      '﻿---\r\ntitle: 제목 (第2回)\r\nemoji: "🎵"\r\ntopics: ["react", "ios"]\r\n---\r\n본문';
    expect(parseZennFrontmatter(text)).toEqual({
      title: '제목 (第2回)',
      emoji: '🎵',
      type: 'tech',
      topics: ['react', 'ios'],
    });
  });

  test('frontmatter가 없거나 제목이 비면 undefined', () => {
    expect(parseZennFrontmatter('# 제목\n본문')).toBeUndefined();
    expect(parseZennFrontmatter('---\ntitle: ""\n---\n')).toBeUndefined();
  });
});

describe('buildPublishInfoPrompt', () => {
  test('제목·본문만 프롬프트에 들어가고 본문은 상한에서 자른다', () => {
    const { system, prompt } = buildPublishInfoPrompt(
      { title: '제목', body: 'x'.repeat(30) },
      { ...WRITING_LIMITS, publishInfoBodyChars: 10 },
    );
    expect(system).toContain('150자');
    expect(prompt).toBe(`# 제목\n제목\n\n# 본문\n${'x'.repeat(10)}\n\n(이하 생략)\n`);
  });
});

describe('createPublishInfoStepRunner', () => {
  test('본문 제목·Zenn frontmatter·근거 포인터로 publish.md를 조립하고 DATA_DIR에 쓴다', async () => {
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const thumbnails = fakeThumbnails();
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: (id) => (id === adapter.id ? adapter : undefined) },
      thumbnails,
      thumbnailConfig: { brand: 'Blog.log' },
    });

    const result = await runner.run(ctx());

    // 썸네일: 모델의 제목 줄·부제·알약 + 설정 브랜드로 한 번 찍어 DATA_DIR에 PNG로. 시리즈가 아니면 배지 없음.
    expect(thumbnails.calls).toEqual([
      {
        titleLines: ['무한 스크롤', '미리', '불러오기'],
        subtitle: '끝에 닿기 전에 다음 페이지를',
        tags: ['React', 'IntersectionObserver'],
        brand: 'Blog.log',
      },
    ]);
    expect(await artifacts.readBytes('infinite-scroll', 'run_1', THUMBNAIL_ARTIFACT)).toEqual({
      ok: true,
      bytes: PNG,
    });
    expect(Object.keys(result.artifacts)).toEqual([PUBLISH_ARTIFACT]);

    const text = result.artifacts[PUBLISH_ARTIFACT]!;
    expect(text.startsWith('# 발행 정보 — 무한 스크롤 미리 불러오기\n')).toBe(true);
    expect(text).toContain('피드 끝에 닿기 전에 다음 페이지를 불러온 이야기.');
    expect(text).toContain('## 태그\n\nReact\n무한스크롤\n');
    expect(text).toContain('タイトル: 無限スクロールの先読み');
    expect(text).toContain('- abcdef1 src/scroll.ts:L10-12 (2024-03-05) — 다음 페이지 미리 읽기');
    expect(text).toContain('무한_스크롤_미리_불러오기_썸네일.png (1200×630)');
    // 조각은 파일에도 프롬프트에도 없다.
    expect(text).not.toContain('SECRET_SNIPPET');
    expect(adapter.calls[0]!.prompt).not.toContain('SECRET_SNIPPET');
    expect(adapter.calls[0]!.prompt).not.toContain('spacehome');
    expect(adapter.calls[0]!.prompt).toContain('# 제목\n무한 스크롤 미리 불러오기');
    expect(result).toMatchObject({ model: adapter.id, costUsd: 0.001 });
    expect(result.tokens?.output).toBeGreaterThan(0);
    expect(result.promptHash).toBeUndefined();

    const stored = await artifacts.read('infinite-scroll', 'run_1', PUBLISH_ARTIFACT);
    expect(stored).toEqual({ ok: true, text });
  });

  test('시리즈 편이면 제목의 시리즈 표기를 떼고 시리즈 절·체크리스트를 붙인다', async () => {
    const series: SeriesStepInfo = {
      name: '결제 전환',
      episodeNo: 2,
      total: 3,
      previous: { title: '1편' },
      alreadyPublished: false,
    };
    await artifacts.write(
      'infinite-scroll',
      'run_1',
      VELOG_ARTIFACT,
      '# 무한 스크롤 | 결제 전환 2편\n\n> 결제 전환 시리즈 2편. [이전 편: 1편]([벨로그 링크])\n\n본문\n',
    );
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => adapter },
    });

    const text = (await runner.run(ctx({ series }))).artifacts[PUBLISH_ARTIFACT]!;

    expect(text.startsWith('# 발행 정보 — 무한 스크롤\n')).toBe(true);
    expect(text).toContain('## 벨로그 시리즈\n\n결제 전환 · 2/3편\n');
    expect(text).toContain('"1편" 글 URL로 채움');
    expect(adapter.calls[0]!.prompt).not.toContain('시리즈 2편');
  });

  test('삽화 단계의 목록이 있으면 `## 삽화` 절을 쓴다 — carried면 출처 Run의 목록, 없거나 깨졌으면 절 없음', async () => {
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const runner = runnerWith({ store, artifacts, adapters: { get: () => adapter } });
    const manifest = (name: string) =>
      JSON.stringify({ version: 1, items: [{ n: 1, name, where: '표 다음' }] });
    const run = async (overrides: Partial<StepContext> = {}) =>
      (await runner.run(ctx(overrides))).artifacts[PUBLISH_ARTIFACT]!;

    await artifacts.remove('infinite-scroll', 'run_1', ILLUSTRATIONS_MANIFEST);
    expect(await run()).not.toContain('## 삽화');
    await artifacts.write('infinite-scroll', 'run_1', ILLUSTRATIONS_MANIFEST, '{ nope');
    expect(await run()).not.toContain('## 삽화');

    await artifacts.write(
      'infinite-scroll',
      'run_1',
      ILLUSTRATIONS_MANIFEST,
      manifest('illust1_a'),
    );
    expect(await run()).toContain(
      '## 삽화 (1200×520)\n\n- illust1_a.png · 일본어판 illust1_a_ja.png — 자리: 표 다음\n',
    );

    await artifacts.write(
      'infinite-scroll',
      'run_0',
      ILLUSTRATIONS_MANIFEST,
      manifest('illust1_b'),
    );
    expect(await run({ sources: { illustration: 'run_0' } })).toContain('- illust1_b.png');
    await artifacts.remove('infinite-scroll', 'run_1', ILLUSTRATIONS_MANIFEST);
    await artifacts.remove('infinite-scroll', 'run_0', ILLUSTRATIONS_MANIFEST);
  });

  test('carried면 sources의 Run에서 본문·Zenn·번들을 읽는다', async () => {
    await artifacts.write('infinite-scroll', 'run_0', VELOG_ARTIFACT, '# 옛 제목\n\n본문\n');
    await artifacts.write('infinite-scroll', 'run_0', ZENN_ARTIFACT, ZENN);
    await store.write({ ...BUNDLE, runId: 'run_0', items: [] });
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => adapter },
    });

    const text = (
      await runner.run(ctx({ sources: { velog: 'run_0', zenn: 'run_0', evidence: 'run_0' } }))
    ).artifacts[PUBLISH_ARTIFACT]!;

    expect(text.startsWith('# 발행 정보 — 옛 제목\n')).toBe(true);
    expect(text).toContain('근거 없음');
  });

  test('모델이 JSON을 안 주면 재시도 가능 실패, 다음 시도에 성공', async () => {
    const adapter = createScriptedAdapter((_input, i) => (i === 0 ? '소개는요…' : GOOD_OUTPUT));
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => adapter },
    });

    await expect(runner.run(ctx())).rejects.toMatchObject({
      code: 'PUBLISH_INFO_OUTPUT_INVALID',
      retryable: true,
    });
    expect((await runner.run(ctx())).artifacts[PUBLISH_ARTIFACT]).toContain('## 태그');
  });

  test.each([
    ['velog', VELOG_ARTIFACT, 'PUBLISH_INFO_VELOG_MISSING'],
    ['zenn', ZENN_ARTIFACT, 'PUBLISH_INFO_ZENN_MISSING'],
  ])('%s 산출물이 없으면 그 단계부터 다시(재시도 불가)', async (_label, name, code) => {
    await artifacts.remove('infinite-scroll', 'run_1', name);
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => adapter },
    });

    await expect(runner.run(ctx())).rejects.toMatchObject({ code, retryable: false });
    expect(adapter.calls).toHaveLength(0);
  });

  test('근거 묶음이 없으면 PUBLISH_INFO_EVIDENCE_MISSING', async () => {
    await store.remove('infinite-scroll', 'run_1');
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => adapter },
    });

    await expect(runner.run(ctx())).rejects.toMatchObject({
      code: 'PUBLISH_INFO_EVIDENCE_MISSING',
    });
  });

  test('Zenn frontmatter가 깨졌으면 PUBLISH_INFO_ZENN_INVALID', async () => {
    await artifacts.write('infinite-scroll', 'run_1', ZENN_ARTIFACT, '# 제목만\n');
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => createScriptedAdapter(() => GOOD_OUTPUT) },
    });
    await expect(runner.run(ctx())).rejects.toMatchObject({ code: 'PUBLISH_INFO_ZENN_INVALID' });
  });

  test('모델이 없거나 키가 없으면 그 코드로', async () => {
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => undefined },
    });
    await expect(runner.run(ctx())).rejects.toMatchObject({ code: 'PUBLISH_INFO_MODEL_UNKNOWN' });
    const noKey = { ...createScriptedAdapter(() => GOOD_OUTPUT), available: false };
    const runner2 = runnerWith({
      store,
      artifacts,
      adapters: { get: () => noKey },
    });
    await expect(runner2.run(ctx())).rejects.toMatchObject({
      code: 'PUBLISH_INFO_MODEL_UNAVAILABLE',
    });
  });

  test('(기존 글) 편은 모델을 부르기 전에 멈춘다', async () => {
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => adapter },
    });
    const series: SeriesStepInfo = { name: 'S', episodeNo: 1, total: 1, alreadyPublished: true };
    await expect(runner.run(ctx({ series }))).rejects.toMatchObject({
      code: 'SERIES_EPISODE_ALREADY_PUBLISHED',
    });
    expect(adapter.calls).toHaveLength(0);
  });

  test('모델이 제목 줄을 안 주면 제목에서 기본 나누기, 설정이 없으면 빈 브랜드', async () => {
    const adapter = createScriptedAdapter(() =>
      JSON.stringify({ intro: '소개', tags: ['a'], subtitle: '부제' }),
    );
    const thumbnails = fakeThumbnails();
    await runnerWith({ store, artifacts, adapters: { get: () => adapter }, thumbnails }).run(ctx());
    expect(thumbnails.calls[0]).toEqual({
      titleLines: ['무한 스크롤 미리', '불러오기'],
      subtitle: '부제',
      tags: ['a'],
      brand: '',
    });
  });

  test('모델이 그림 조각을 주면 썸네일 입력에 그대로 넘긴다(거르기는 렌더러 몫)', async () => {
    const art = '<div class="card" style="left:10px;top:20px"><script>x()</script>a</div>';
    const adapter = createScriptedAdapter(() => `${GOOD_OUTPUT}\n${THUMBNAIL_ART_MARKER}\n${art}`);
    const thumbnails = fakeThumbnails();
    await runnerWith({ store, artifacts, adapters: { get: () => adapter }, thumbnails }).run(ctx());
    expect(thumbnails.calls[0]?.artHtml).toBe(art);
  });

  test('시리즈 편이면 썸네일에 시리즈 배지 값(이름·편·총 편수)을 넘긴다', async () => {
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const thumbnails = fakeThumbnails();
    const series: SeriesStepInfo = {
      name: '피드 만들기',
      episodeNo: 2,
      total: 6,
      alreadyPublished: false,
    };
    await runnerWith({ store, artifacts, adapters: { get: () => adapter }, thumbnails }).run(
      ctx({ series }),
    );
    expect(thumbnails.calls[0]?.series).toEqual({ name: '피드 만들기', episodeNo: 2, total: 6 });
  });

  test.each([
    ['THUMBNAIL_CHROME_NOT_FOUND', false],
    ['THUMBNAIL_RENDER_TIMEOUT', true],
    ['THUMBNAIL_RENDER_FAILED', false],
  ] as const)(
    '썸네일 실패 %s는 단계 실패(retryable %s) — 발행정보도 쓰지 않는다',
    async (code, retryable) => {
      const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
      const failing =
        code === 'THUMBNAIL_CHROME_NOT_FOUND'
          ? fakeThumbnails({ ok: false, code })
          : fakeThumbnails({ ok: false, code, detail: 'x' });
      const runner = runnerWith({
        store,
        artifacts,
        adapters: { get: () => adapter },
        thumbnails: failing,
      });

      await expect(runner.run(ctx())).rejects.toMatchObject({ code, retryable });
      expect(await artifacts.read('infinite-scroll', 'run_1', PUBLISH_ARTIFACT)).toEqual({
        ok: false,
        code: 'ARTIFACT_MISSING',
      });
    },
  );

  test('discard는 이 Run의 publish.md·thumbnail.png를 지운다', async () => {
    const adapter = createScriptedAdapter(() => GOOD_OUTPUT);
    const runner = runnerWith({
      store,
      artifacts,
      adapters: { get: () => adapter },
    });
    await runner.run(ctx());
    await runner.discard!(ctx());
    expect(await artifacts.read('infinite-scroll', 'run_1', PUBLISH_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
    expect(await artifacts.readBytes('infinite-scroll', 'run_1', THUMBNAIL_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
  });
});
