// 모델은 스크립트 어댑터, 번들·산출물은 임시 DATA_DIR. DB 없음.
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceBundle } from '../evidence/bundle.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { WRITING_LIMITS } from './limits.ts';
import {
  buildPublishInfoPrompt,
  createPublishInfoStepRunner,
  parsePublishInfoOutput,
  parseZennFrontmatter,
  PUBLISH_ARTIFACT,
  THUMBNAIL_ARTIFACT,
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
  tag: 'TROUBLESHOOTING',
});
const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);

/** 렌더 입력을 기록하는 가짜 렌더러(Chrome 없음). */
function fakeThumbnails(result?: Awaited<ReturnType<ThumbnailRenderer['render']>>) {
  const calls: ThumbnailInput[] = [];
  const renderer: ThumbnailRenderer & { calls: ThumbnailInput[] } = {
    calls,
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
      tag: 'TROUBLESHOOTING',
    });
  });

  test('코드 펜스로 감싼 JSON도 읽는다', () => {
    expect(parsePublishInfoOutput('```json\n{"intro":"소개","tags":["a"]}\n```')).toEqual({
      intro: '소개',
      tags: ['a'],
      subtitle: '소개',
      tag: '',
    });
  });

  test('부제는 40자에서 자르고 없으면 소개 앞부분, 라벨은 대문자 한 단어가 아니면 빈 값', () => {
    const out = parsePublishInfoOutput(
      JSON.stringify({
        intro: '소개',
        tags: [],
        subtitle: '가'.repeat(50),
        tag: 'trouble shooting',
      }),
    );
    expect(out?.subtitle).toBe('가'.repeat(40));
    expect(out?.tag).toBe('');
    expect(
      parsePublishInfoOutput(JSON.stringify({ intro: '소개', tags: [], tag: 'RETRO-2' }))?.tag,
    ).toBe('RETRO-2');
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
      thumbnailConfig: { footerLeft: 'Blog', footerRight: 'velog.io/@h', defaultTag: 'X' },
    });

    const result = await runner.run(ctx());

    // 썸네일: 모델 부제·라벨 + 설정 푸터로 한 번 찍어 DATA_DIR에 PNG로.
    expect(thumbnails.calls).toEqual([
      {
        title: '무한 스크롤 미리 불러오기',
        subtitle: '끝에 닿기 전에 다음 페이지를',
        tag: 'TROUBLESHOOTING',
        footerLeft: 'Blog',
        footerRight: 'velog.io/@h',
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
    expect(text).toContain('무한_스크롤_미리_불러오기_썸네일.png (1200×630, 텍스트 전용)');
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

  test('라벨이 비면 설정의 기본 태그, 설정이 없으면 빈 푸터', async () => {
    const adapter = createScriptedAdapter(() =>
      JSON.stringify({ intro: '소개', tags: ['a'], subtitle: '부제', tag: '' }),
    );
    const thumbnails = fakeThumbnails();
    await runnerWith({ store, artifacts, adapters: { get: () => adapter }, thumbnails }).run(ctx());
    expect(thumbnails.calls[0]).toMatchObject({
      tag: 'TROUBLESHOOTING',
      footerLeft: '',
      footerRight: '',
    });
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
