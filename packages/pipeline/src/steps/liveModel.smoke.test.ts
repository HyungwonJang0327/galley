// 실모델 스모크(수동) — 실제 레지스트리 + 합성 근거 번들(tmp DATA_DIR) + 실제 어투 폴더로 벨로그 단계를 한 번 돌려
// 결과 길이·토큰·비용을 출력한다(BS2 리뷰 ⑭, BS5). 토큰이 들므로 **환경 변수로 켤 때만** 돈다:
//   GALLEY_LIVE_SMOKE=1 [GALLEY_LIVE_MODEL=anthropic:claude-haiku-4-5-20251001] pnpm --filter @galley/pipeline test:smoke
// 키(.env)는 `--env-file`이 아니라 셸 환경으로 넘긴다(vitest는 .env를 읽지 않는다). CI는 켜지 않으므로 건너뛴다.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import type { EvidenceBundle } from '../evidence/bundle.ts';
import { createModelRegistryFromEnv, DEFAULT_MODEL_ID } from '../model/ModelRegistry.ts';
import { resolveTonePromptsDir } from '../prompts/tonePrompts.ts';
import { createVelogStepRunner, VELOG_ARTIFACT } from './velogStep.ts';

const enabled = process.env.GALLEY_LIVE_SMOKE === '1';
const modelId = process.env.GALLEY_LIVE_MODEL ?? DEFAULT_MODEL_ID;

/** 합성 번들 — 회사 코드가 아닌 지어낸 조각. 실모델 출력이 어투·근거 지시를 따르는지 눈으로 볼 정도의 크기. */
const BUNDLE: EvidenceBundle = {
  version: 1,
  runId: 'live_1',
  topicId: 'live-topic',
  topicSlug: 'live-smoke',
  collectedAt: '2026-09-26T00:00:00.000Z',
  items: [
    {
      analysisId: 'a1',
      commit: '0123456789abcdef',
      path: 'src/feed/useInfiniteScroll.ts',
      lineRange: { start: 12, end: 20 },
      date: '2026-06-03T10:00:00+09:00',
      note: 'IntersectionObserver로 다음 페이지를 미리 불러온다',
      source: 'linked',
      redacted: true,
      truncated: false,
      snippet:
        'const io = new IntersectionObserver(([entry]) => {\n  if (entry?.isIntersecting) loadNext();\n}, { rootMargin: "200px" });\nio.observe(sentinel);',
    },
  ],
  analyses: [
    { id: 'a1', kind: 'area', title: 'feed 영역', summary: '무한 스크롤 피드와 페이지 캐시.' },
  ],
  unreadable: 0,
  filtered: true,
};

describe.skipIf(!enabled)('실모델 스모크 (GALLEY_LIVE_SMOKE=1)', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'galley-live-smoke-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test(
    `벨로그 단계를 ${modelId}로 한 번 돌려 결과·토큰·비용을 출력한다`,
    async () => {
      const registry = createModelRegistryFromEnv(process.env);
      const adapter = registry.get(modelId);
      if (adapter === undefined) throw new Error(`레지스트리에 없는 모델 id: ${modelId}`);
      if (!adapter.available)
        throw new Error(`${modelId}의 API 키가 환경에 없다 — 셸에서 .env 값을 넘겨야 한다`);
      const prompts = resolveTonePromptsDir(process.env);
      if (!prompts.ok) throw new Error(`PROMPTS_DIR: ${prompts.code} ${prompts.value}`);

      const store = new LocalFsEvidenceStore(join(dir, 'data'));
      const artifacts = new LocalFsArtifactStore(join(dir, 'data'));
      await store.write(BUNDLE);
      const runner = createVelogStepRunner({
        store,
        artifacts,
        promptsDir: prompts.dir,
        adapters: registry,
      });

      const startedAt = Date.now();
      const result = await runner.run({
        runId: BUNDLE.runId,
        step: 'velog',
        topic: { id: BUNDLE.topicId, title: '무한 스크롤 미리 불러오기', slug: BUNDLE.topicSlug },
        modelId,
        sources: {},
        signal: new AbortController().signal,
      });
      const body = result.artifacts[VELOG_ARTIFACT] ?? '';

      console.log(
        JSON.stringify(
          {
            model: result.model,
            durationMs: Date.now() - startedAt,
            tokens: result.tokens,
            costUsd: result.costUsd,
            bodyChars: body.length,
            firstLine: body.split('\n')[0],
          },
          null,
          2,
        ),
      );
      expect(body.trim()).not.toBe('');
      expect(result.tokens?.output ?? 0).toBeGreaterThan(0);
    },
    5 * 60_000,
  );
});
