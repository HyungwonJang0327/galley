// 뒤 단계 고침(답 반영 실행의 링크드인·Zenn 단계) — 스크립트 어댑터 + 임시 DATA_DIR. DB 없음.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { hashPromptText } from '../prompts/tonePrompts.ts';
import { REVIEW_RESULT_ARTIFACT, renderReviewResult } from '../review/answerResult.ts';
import type { StepContext } from './StepRunner.ts';
import { createLinkedinStepRunner, LINKEDIN_ARTIFACT } from './linkedinStep.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { createZennStepRunner, ZENN_ARTIFACT } from './zennStep.ts';

const SLUG = '한-피드';
const LINKEDIN_TONE = '# 링크드인 어투\n- 해요체.\n';
const ZENN_TONE = '# Zenn 어투\n- です・ます체.\n';

const BODY_BEFORE = [
  '# 한 피드에 섞기',
  '',
  '도입 문단이다.',
  '',
  '테이블을 둘로 나눴다. 응답 시간이 절반으로 줄었다.',
  '',
  '제약은 애플리케이션에서 검사했다.',
  '<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
  '',
  '마무리 문단이다.',
  '',
].join('\n');
/** 근거 없는 문장을 뺐고(내용 바뀜) 주석을 지웠다(내용 그대로). */
const BODY_AFTER = BODY_BEFORE.replace(' 응답 시간이 절반으로 줄었다.', '').replace(
  '\n<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
  '',
);
/** 주석만 지웠다 — 글 내용은 그대로. */
const BODY_COMMENT_ONLY = BODY_BEFORE.replace(
  '\n<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
  '',
);

const LINKEDIN_BEFORE = [
  '피드 두 종류를 한 화면에 섞었어요.',
  '',
  '테이블을 둘로 나눴고, 응답 시간이 절반으로 줄었어요.',
  '',
  '제약은 애플리케이션에서 검사해요.',
  '',
  '둘로 나눈 뒤 쿼리가 단순해졌어요.',
  '',
  '자세한 글: [벨로그 링크]',
  '',
].join('\n');
const LINKEDIN_AFTER = LINKEDIN_BEFORE.replace(
  '테이블을 둘로 나눴고, 응답 시간이 절반으로 줄었어요.',
  '테이블을 둘로 나눴어요.',
);

const ZENN_HEAD = [
  '---',
  'title: "一つのフィードに混ぜる"',
  'emoji: "📝"',
  'type: "tech"',
  'topics: []',
  'published: false',
  '---',
  '',
].join('\n');
const ZENN_TEXT_BEFORE = [
  '導入の段落です。',
  '',
  'テーブルを二つに分けました。応答時間が半分になりました。',
  '',
  '制約はアプリケーションで検査しました。',
  '',
  'まとめの段落です。',
].join('\n');
const ZENN_TEXT_AFTER = ZENN_TEXT_BEFORE.replace('応答時間が半分になりました。', '');
const ZENN_BEFORE = `${ZENN_HEAD}\n${ZENN_TEXT_BEFORE}\n`;

let dir: string;
let artifacts: LocalFsArtifactStore;
let promptsDir: string;
let n = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-derived-patch-'));
  artifacts = new LocalFsArtifactStore(join(dir, 'data'));
  promptsDir = join(dir, 'prompts');
  await mkdir(promptsDir, { recursive: true });
  await writeFile(join(promptsDir, 'linkedin.md'), LINKEDIN_TONE);
  await writeFile(join(promptsDir, 'zenn.md'), ZENN_TONE);
  await artifacts.write(SLUG, 'run_base', VELOG_ARTIFACT, BODY_BEFORE);
  await artifacts.write(SLUG, 'run_base', LINKEDIN_ARTIFACT, LINKEDIN_BEFORE);
  await artifacts.write(SLUG, 'run_base', ZENN_ARTIFACT, ZENN_BEFORE);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** 본문 고침이 끝난 답 반영 실행 하나 — 이 Run의 velog.md와 review-result.json이 있다. */
async function setup(
  step: 'linkedin' | 'zenn',
  adapter: ModelAdapter,
  body: string | null = BODY_AFTER,
) {
  const deps = {
    artifacts,
    promptsDir,
    adapters: { get: (id: string) => (id === adapter.id ? adapter : undefined) },
  };
  const runner = step === 'linkedin' ? createLinkedinStepRunner(deps) : createZennStepRunner(deps);
  const runId = `run_${(n += 1)}`;
  if (body !== null) {
    await artifacts.write(SLUG, runId, VELOG_ARTIFACT, body);
    await artifacts.write(
      SLUG,
      runId,
      REVIEW_RESULT_ARTIFACT,
      renderReviewResult({ version: 1, baseRunId: 'run_base', applied: ['u1'], unapplied: [] }),
    );
  }
  const ctx: StepContext = {
    runId,
    step,
    topic: { id: 't1', title: '한 피드', slug: SLUG },
    modelId: adapter.id,
    sources: { evidence: 'run_base' },
    patch: { baseRunId: 'run_base', answers: [] },
    signal: new AbortController().signal,
  };
  const read = async (name: string) => {
    const got = await artifacts.read(SLUG, runId, name);
    return got.ok ? got.text : undefined;
  };
  const record = async () => JSON.parse((await read(`${step}-patch.json`)) ?? 'null') as unknown;
  return { runner, ctx, read, record };
}

const never = () =>
  createScriptedAdapter(() => {
    throw new Error('모델을 부르지 않는다');
  });

describe('링크드인 고침', () => {
  test('본문에서 바뀐 곳과 이전 글을 주고, 그 대목만 고친 출력을 채택한다', async () => {
    const adapter = createScriptedAdapter(() => `\`\`\`\n${LINKEDIN_AFTER}\`\`\``);
    const { runner, ctx, read, record } = await setup('linkedin', adapter);

    const result = await runner.run(ctx);

    expect(await read(LINKEDIN_ARTIFACT)).toBe(LINKEDIN_AFTER);
    expect(result.artifacts[LINKEDIN_ARTIFACT]).toBe(LINKEDIN_AFTER);
    expect(result).toMatchObject({
      model: adapter.id,
      costUsd: 0.001,
      promptHash: hashPromptText(LINKEDIN_TONE),
    });
    expect(await record()).toEqual({ version: 1, baseRunId: 'run_base', status: 'patched' });

    expect(adapter.calls).toHaveLength(1);
    const { system, prompt } = adapter.calls[0]!;
    expect(system).toContain('이미 쓰인 링크드인 글을');
    expect(system?.endsWith(LINKEDIN_TONE)).toBe(true);
    // 주석만 지운 문단은 바뀐 곳이 아니다 — 문장을 뺀 한 곳만.
    expect(prompt).toContain('# 본문에서 바뀐 곳(1곳)');
    expect(prompt).toContain('바뀌기 전:\n```\n테이블을 둘로 나눴다. 응답 시간이 절반으로 줄었다.');
    expect(prompt).toContain('바뀐 뒤:\n```\n테이블을 둘로 나눴다.\n```');
    expect(prompt).not.toContain('[확인 필요]');
    expect(prompt).toContain(`# 이전 링크드인 글 전체\n\`\`\`\n${LINKEDIN_BEFORE.trim()}\n\`\`\``);
    expect(prompt).not.toContain('# 주의');
  });

  test('본문 내용이 안 바뀌었으면(주석만 지움) 모델 없이 이전 글 그대로', async () => {
    const adapter = never();
    const { runner, ctx, read, record } = await setup('linkedin', adapter, BODY_COMMENT_ONLY);

    const result = await runner.run(ctx);

    expect(await read(LINKEDIN_ARTIFACT)).toBe(LINKEDIN_BEFORE);
    expect(result.tokens).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(await record()).toEqual({ version: 1, baseRunId: 'run_base', status: 'unchanged' });
  });

  test('모델이 아무것도 바꾸지 않았으면(이 글이 다루지 않는 내용) 이전 글 그대로 — 사용량은 남는다', async () => {
    const adapter = createScriptedAdapter(() => LINKEDIN_BEFORE);
    const { runner, ctx, read, record } = await setup('linkedin', adapter);

    const result = await runner.run(ctx);

    expect(await read(LINKEDIN_ARTIFACT)).toBe(LINKEDIN_BEFORE);
    expect(result.model).toBe(adapter.id);
    expect(await record()).toMatchObject({ status: 'unchanged' });
  });

  // 본문에서 바뀐 곳은 하나 — 이 글에서도 한 곳(문단 ±1)만 바뀔 수 있다. 둘째·다섯째 문단은 한 창에 들지 않는다.
  test('바뀐 곳 수보다 많은 곳을 고친 출력은 반려하고 1회 재시도한다 — 사용량은 합친다', async () => {
    const tooWide = LINKEDIN_AFTER.replace('자세한 글:', '더 자세한 이야기:');
    const adapter = createScriptedAdapter((_input, index) =>
      index === 0 ? tooWide : LINKEDIN_AFTER,
    );
    const { runner, ctx, read, record } = await setup('linkedin', adapter);

    const result = await runner.run(ctx);

    expect(await read(LINKEDIN_ARTIFACT)).toBe(LINKEDIN_AFTER);
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[1]?.prompt).toContain('# 주의\n직전 시도는');
    expect(result.costUsd).toBeCloseTo(0.002);
    expect(await record()).toMatchObject({ status: 'patched' });
  });

  test('두 번 다 반려되면 이전 글을 그대로 두고 그 사실을 남긴다', async () => {
    const rewritten = '완전히 새로 쓴 글이에요.\n\n둘째.\n\n셋째.\n\n넷째.\n\n다섯째.\n\n여섯째.\n';
    const adapter = createScriptedAdapter(() => rewritten);
    const { runner, ctx, read, record } = await setup('linkedin', adapter);

    await runner.run(ctx);

    expect(await read(LINKEDIN_ARTIFACT)).toBe(LINKEDIN_BEFORE);
    expect(adapter.calls).toHaveLength(2);
    expect(await record()).toEqual({
      version: 1,
      baseRunId: 'run_base',
      status: 'kept',
      code: 'PATCH_OUT_OF_SCOPE',
    });
  });

  test('빈 출력도 반려로 다룬다', async () => {
    const adapter = createScriptedAdapter(() => '   ');
    const { runner, ctx, read, record } = await setup('linkedin', adapter);

    await runner.run(ctx);

    expect(await read(LINKEDIN_ARTIFACT)).toBe(LINKEDIN_BEFORE);
    expect(await record()).toMatchObject({ status: 'kept', code: 'PATCH_OUTPUT_INVALID' });
  });

  test('고칠 이전 글·본문 고침 결과가 없으면 다시 만들지 않고 실패한다', async () => {
    const missingBase = await setup('linkedin', never());
    await expect(
      missingBase.runner.run({
        ...missingBase.ctx,
        patch: { baseRunId: 'run_none', answers: [] },
      }),
    ).rejects.toMatchObject({ code: 'LINKEDIN_PATCH_BASE_MISSING', retryable: false });

    const noBodyResult = await setup('linkedin', never(), null);
    await expect(noBodyResult.runner.run(noBodyResult.ctx)).rejects.toMatchObject({
      code: 'LINKEDIN_PATCH_BODY_RESULT_MISSING',
      retryable: false,
    });
  });

  test('본문이 이전 결과 유지(carried)면 바뀐 곳이 없다 — 모델 없이 그대로', async () => {
    const { runner, ctx, read } = await setup('linkedin', never(), null);
    await runner.run({ ...ctx, sources: { velog: 'run_base' } });
    expect(await read(LINKEDIN_ARTIFACT)).toBe(LINKEDIN_BEFORE);
  });

  test('반환(discard)하면 글과 결과 파일을 함께 버린다', async () => {
    const { runner, ctx, read } = await setup('linkedin', never(), BODY_COMMENT_ONLY);
    await runner.run(ctx);
    await runner.discard?.(ctx);
    expect(await read(LINKEDIN_ARTIFACT)).toBeUndefined();
    expect(await read('linkedin-patch.json')).toBeUndefined();
  });
});

describe('Zenn 고침', () => {
  test('frontmatter는 모델에 주지 않고 그대로 다시 붙인다 — 글만 고친다', async () => {
    // 모델이 frontmatter를 붙여 내도 버린다.
    const adapter = createScriptedAdapter(
      () => `---\ntitle: "勝手なタイトル"\npublished: true\n---\n\n${ZENN_TEXT_AFTER}\n`,
    );
    const { runner, ctx, read, record } = await setup('zenn', adapter);

    const result = await runner.run(ctx);

    const written = await read(ZENN_ARTIFACT);
    expect(written).toBe(`${ZENN_HEAD}\n${ZENN_TEXT_AFTER}\n`);
    expect(written).toContain('published: false');
    expect(written).not.toContain('勝手なタイトル');
    expect(result.promptHash).toBe(hashPromptText(ZENN_TONE));
    expect(await record()).toEqual({ version: 1, baseRunId: 'run_base', status: 'patched' });

    const { system, prompt } = adapter.calls[0]!;
    expect(system).toContain('이 글은 일본어입니다');
    expect(system?.endsWith(ZENN_TONE)).toBe(true);
    expect(prompt).toContain(`# 이전 Zenn 기사 전체\n\`\`\`\n${ZENN_TEXT_BEFORE}\n\`\`\``);
    expect(prompt).not.toContain('published');
  });

  test('두 번 다 반려되면 이전 기사를 바이트 그대로 둔다', async () => {
    const adapter = createScriptedAdapter(() =>
      ZENN_TEXT_AFTER.replace('導入の段落です。', '導入を書き直しました。').replace(
        'まとめの段落です。',
        'まとめも書き直しました。',
      ),
    );
    const { runner, ctx, read, record } = await setup('zenn', adapter);

    await runner.run(ctx);

    expect(await read(ZENN_ARTIFACT)).toBe(ZENN_BEFORE);
    expect(await record()).toMatchObject({ status: 'kept', code: 'PATCH_OUT_OF_SCOPE' });
  });

  test('본문 내용이 안 바뀌었으면 모델 없이 이전 기사 그대로', async () => {
    const { runner, ctx, read, record } = await setup('zenn', never(), BODY_COMMENT_ONLY);
    await runner.run(ctx);
    expect(await read(ZENN_ARTIFACT)).toBe(ZENN_BEFORE);
    expect(await record()).toMatchObject({ status: 'unchanged' });
  });
});
