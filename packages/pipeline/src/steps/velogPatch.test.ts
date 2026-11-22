// 본문 고침(답 반영 실행의 velog 단계) — 스크립트 어댑터 + 임시 DATA_DIR. DB 없음.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import type { ModelAdapter } from '../model/ModelAdapter.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { hashPromptText } from '../prompts/tonePrompts.ts';
import { REVIEW_RESULT_ARTIFACT } from '../review/answerResult.ts';
import type { ReviewAnswerItem } from '../review/answerSet.ts';
import { selectReviewQuestions } from '../review/questions.ts';
import type { StepContext } from './StepRunner.ts';
import { buildVelogPatchPrompt } from './velogPatch.ts';
import { createVelogStepRunner, VELOG_ARTIFACT } from './velogStep.ts';

const TONE = '# 벨로그 어투\n- -다체.\n';
const SLUG = '한-피드';
const BASE = [
  '# 한 피드에 섞기',
  '',
  '도입 문단이다.',
  '',
  '테이블을 둘로 나눴다. 응답 시간이 절반으로 줄었다.',
  '',
  '```sql',
  'SELECT 1;',
  '',
  'SELECT 2;',
  '```',
  '',
  '제약은 애플리케이션에서 검사했다.',
  '<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
  '',
  '<!-- [삽화] illust1_a.png — 여기: 표 다음 -->',
  '',
  '마무리 문단이다.',
  '',
].join('\n');
const QUESTIONS = selectReviewQuestions(BASE, [
  { text: '응답 시간이 절반으로 줄었다.', status: 'unsupported', line: 5 },
]).questions;
const comment = QUESTIONS.find((q) => q.source === 'comment')!;
const claim = QUESTIONS.find((q) => q.source === 'unsupported')!;
const fill = (question: typeof comment, text: string): ReviewAnswerItem => ({
  question,
  answer: { id: question.id, kind: 'fill', text },
});

let dir: string;
let artifacts: LocalFsArtifactStore;
let promptsDir: string;
let n = 0;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-velog-patch-'));
  artifacts = new LocalFsArtifactStore(join(dir, 'data'));
  promptsDir = join(dir, 'prompts');
  await mkdir(promptsDir, { recursive: true });
  await writeFile(join(promptsDir, 'velog.md'), TONE);
  await artifacts.write(SLUG, 'run_base', VELOG_ARTIFACT, BASE);
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

function setup(adapter: ModelAdapter & { calls?: unknown[] }) {
  const runner = createVelogStepRunner({
    // 고침은 근거 묶음을 읽지 않는다 — 빈 저장소여도 돈다.
    store: new LocalFsEvidenceStore(join(dir, 'data')),
    artifacts,
    promptsDir,
    adapters: { get: (id) => (id === adapter.id ? adapter : undefined) },
  });
  const runId = `run_${(n += 1)}`;
  const ctx = (answers: ReviewAnswerItem[], baseRunId = 'run_base'): StepContext => ({
    runId,
    step: 'velog',
    topic: { id: 't1', title: '한 피드', slug: SLUG },
    modelId: adapter.id,
    sources: { evidence: 'run_base' },
    patch: { baseRunId, answers },
    signal: new AbortController().signal,
  });
  const read = async (name: string) => {
    const got = await artifacts.read(SLUG, runId, name);
    return got.ok ? got.text : undefined;
  };
  return { runner, ctx, read, runId };
}

/** 주석 문단(제약 문장 + 주석)을 답으로 고친 본문. */
const FILLED = BASE.replace(
  '제약은 애플리케이션에서 검사했다.\n<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
  '제약은 애플리케이션에서 검사했다. CHECK 제약도 검토했지만 마이그레이션 부담 때문에 넣지 않았다.',
);

describe('buildVelogPatchPrompt', () => {
  test('고칠 문단 원문·질문·답과 본문 전체를 싣고, system은 범위 규칙 + 어투', () => {
    const tone = { step: 'velog' as const, text: TONE, hash: hashPromptText(TONE) };
    const targets = [
      { item: fill(comment, '검토했고 넣지 않았다') as never, paragraph: 4, line: 14 },
      { item: fill(claim, '측정값은 없다') as never, paragraph: 2, line: 5 },
    ];
    const { system, prompt } = buildVelogPatchPrompt({ body: BASE, targets, tone });
    expect(system).toContain('그 바로 앞뒤 문단뿐');
    expect(system.endsWith(TONE)).toBe(true);
    expect(prompt).toContain('# 고칠 곳(2건)');
    expect(prompt).toContain('## 1. 본문 14번째 줄의 문단\n문단 원문:\n제약은 애플리케이션에서');
    expect(prompt).toContain('질문: CHECK 제약을 검토했나요?\n작성자의 답: 검토했고 넣지 않았다');
    expect(prompt).toContain(
      '질문: 이 문장은 근거가 확인되지 않았습니다 — "응답 시간이 절반으로 줄었다."',
    );
    expect(prompt).toContain(`# 본문 전체\n${BASE.trimEnd()}\n`);
    expect(prompt).not.toContain('# 주의');
    expect(buildVelogPatchPrompt({ body: BASE, targets, tone, retry: true }).prompt).toContain(
      '# 주의\n직전 시도는',
    );
  });
});

describe('본문 고침 — 모름·삭제(코드)', () => {
  test('모델을 부르지 않고 주석 제거·문장 빼기만 한 본문과 질문 단위 결과를 쓴다', async () => {
    const adapter = createScriptedAdapter(() => {
      throw new Error('모름·삭제는 모델을 부르지 않는다');
    });
    const { runner, ctx, read } = setup(adapter);

    const result = await runner.run(
      ctx([
        { question: comment, answer: { id: comment.id, kind: 'keep' } },
        { question: claim, answer: { id: claim.id, kind: 'delete' } },
      ]),
    );

    const body = await read(VELOG_ARTIFACT);
    expect(body).not.toContain('[확인 필요]');
    expect(body).not.toContain('절반으로');
    expect(body).toContain('테이블을 둘로 나눴다.\n');
    expect(body).toContain('<!-- [삽화] illust1_a.png');
    expect(result.artifacts[VELOG_ARTIFACT]).toBe(body);
    expect(result.tokens).toBeUndefined();
    expect(result.model).toBeUndefined();
    expect(JSON.parse((await read(REVIEW_RESULT_ARTIFACT)) ?? '')).toEqual({
      version: 1,
      baseRunId: 'run_base',
      applied: [comment.id, claim.id],
      unapplied: [],
    });
    expect(adapter.calls).toHaveLength(0);
  });

  test('본문에서 찾지 못한 답은 미반영으로 남기고 나머지는 반영한다', async () => {
    const { runner, ctx, read } = setup(createScriptedAdapter(() => ''));
    const ghost = { ...claim, id: 'u9', question: '본문에 없는 문장이다.' };

    await runner.run(
      ctx([
        { question: ghost, answer: { id: 'u9', kind: 'delete' } },
        { question: comment, answer: { id: comment.id, kind: 'delete' } },
      ]),
    );

    expect(JSON.parse((await read(REVIEW_RESULT_ARTIFACT)) ?? '')).toMatchObject({
      applied: [comment.id],
      unapplied: [{ id: 'u9', code: 'SENTENCE_NOT_FOUND' }],
    });
  });
});

describe('본문 고침 — 채움(모델)', () => {
  test('범위 안만 고친 출력은 채택한다 — 모델이 남긴 주석은 코드가 지운다', async () => {
    // 모델이 답은 반영했지만 주석을 지우지 않았다.
    const withComment = FILLED.replace(
      '넣지 않았다.',
      '넣지 않았다.\n<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
    );
    const adapter = createScriptedAdapter(() => `\`\`\`markdown\n${withComment}\`\`\``);
    const { runner, ctx, read } = setup(adapter);

    const result = await runner.run(ctx([fill(comment, '검토했지만 넣지 않았다')]));

    expect(await read(VELOG_ARTIFACT)).toBe(FILLED);
    expect(adapter.calls).toHaveLength(1);
    expect(adapter.calls[0]?.prompt).toContain('작성자의 답: 검토했지만 넣지 않았다');
    expect(result).toMatchObject({
      model: adapter.id,
      costUsd: 0.001,
      promptHash: hashPromptText(TONE),
    });
    expect(JSON.parse((await read(REVIEW_RESULT_ARTIFACT)) ?? '')).toMatchObject({
      applied: [comment.id],
      unapplied: [],
    });
  });

  test('범위 밖을 바꾼 출력은 반려하고 1회 재시도한다 — 두 번째가 통과하면 채택, 사용량은 합친다', async () => {
    const outOfScope = FILLED.replace('도입 문단이다.', '도입을 새로 썼다.');
    const adapter = createScriptedAdapter((_input, index) => (index === 0 ? outOfScope : FILLED));
    const { runner, ctx, read } = setup(adapter);

    const result = await runner.run(ctx([fill(comment, '검토했지만 넣지 않았다')]));

    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0]?.prompt).not.toContain('# 주의');
    expect(adapter.calls[1]?.prompt).toContain('# 주의');
    expect(await read(VELOG_ARTIFACT)).toBe(FILLED);
    expect(result.costUsd).toBeCloseTo(0.002);
  });

  test('두 번 다 범위 밖이면 이전 본문을 그대로 두고 그 질문을 미반영으로 남긴다 — 코드 답은 반영된 채로', async () => {
    const adapter = createScriptedAdapter(() => FILLED.replace('마무리 문단이다.', '끝.'));
    const { runner, ctx, read } = setup(adapter);

    await runner.run(
      ctx([
        fill(comment, '검토했지만 넣지 않았다'),
        { question: claim, answer: { id: claim.id, kind: 'delete' } },
      ]),
    );

    expect(adapter.calls).toHaveLength(2);
    // 삭제(코드)만 반영되고 채움 자리는 주석까지 이전 그대로다.
    expect(await read(VELOG_ARTIFACT)).toBe(BASE.replace(' 응답 시간이 절반으로 줄었다.', ''));
    expect(JSON.parse((await read(REVIEW_RESULT_ARTIFACT)) ?? '')).toMatchObject({
      applied: [claim.id],
      unapplied: [{ id: comment.id, code: 'PATCH_OUT_OF_SCOPE' }],
    });
  });

  test('출력이 비었거나 잘리면 재시도하고, 또 그러면 PATCH_OUTPUT_INVALID로 미반영', async () => {
    const scripted = createScriptedAdapter(() => FILLED);
    const truncating: ModelAdapter = {
      ...scripted,
      generate: async (input) => ({ ...(await scripted.generate(input)), truncated: true }),
    };
    const { runner, ctx, read } = setup(truncating);

    await runner.run(ctx([fill(comment, '검토했지만 넣지 않았다')]));

    expect(scripted.calls).toHaveLength(2);
    expect(await read(VELOG_ARTIFACT)).toBe(BASE);
    expect(JSON.parse((await read(REVIEW_RESULT_ARTIFACT)) ?? '')).toMatchObject({
      unapplied: [{ id: comment.id, code: 'PATCH_OUTPUT_INVALID' }],
    });
  });

  test('코드 수정으로 줄이 밀려도 채움 자리를 다시 찾는다 — 범위 검사는 고친 뒤 본문 기준', async () => {
    const afterDelete = BASE.replace(' 응답 시간이 절반으로 줄었다.', '');
    const adapter = createScriptedAdapter((input) => {
      // 모델이 받는 본문은 이미 삭제가 반영된 것이다.
      expect(input.prompt).not.toContain('절반으로');
      return afterDelete.replace(
        '제약은 애플리케이션에서 검사했다.\n<!-- [확인 필요] CHECK 제약을 검토했나요? — 근거에 없음 -->',
        '제약은 애플리케이션에서만 검사했다.',
      );
    });
    const { runner, ctx, read } = setup(adapter);

    await runner.run(
      ctx([
        { question: claim, answer: { id: claim.id, kind: 'delete' } },
        fill(comment, '애플리케이션에서만 검사했다'),
      ]),
    );

    expect(await read(VELOG_ARTIFACT)).toContain('제약은 애플리케이션에서만 검사했다.');
    expect(JSON.parse((await read(REVIEW_RESULT_ARTIFACT)) ?? '').unapplied).toEqual([]);
  });

  test('채움 자리를 본문에서 못 찾으면 모델을 부르지 않고 ANCHOR_NOT_FOUND', async () => {
    const adapter = createScriptedAdapter(() => FILLED);
    const { runner, ctx, read } = setup(adapter);
    const ghost = { ...comment, id: 'c9', question: '본문에 없는 질문인가요?' };

    await runner.run(ctx([fill(ghost, '답')]));

    expect(adapter.calls).toHaveLength(0);
    expect(await read(VELOG_ARTIFACT)).toBe(BASE);
    expect(JSON.parse((await read(REVIEW_RESULT_ARTIFACT)) ?? '').unapplied).toEqual([
      { id: 'c9', code: 'ANCHOR_NOT_FOUND' },
    ]);
  });
});

describe('본문 고침 — 실패', () => {
  test('고칠 이전 본문이 없으면 VELOG_PATCH_BASE_MISSING(재시도 없음)', async () => {
    const { runner, ctx } = setup(createScriptedAdapter(() => FILLED));
    await expect(
      runner.run(ctx([{ question: claim, answer: { id: claim.id, kind: 'keep' } }], 'run_nope')),
    ).rejects.toMatchObject({ code: 'VELOG_PATCH_BASE_MISSING', retryable: false });
  });

  test('채움이 있는데 모델을 못 쓰면 본문 단계와 같은 코드로 실패한다', async () => {
    const adapter = { ...createScriptedAdapter(() => FILLED), available: false };
    const { runner, ctx } = setup(adapter);
    await expect(runner.run(ctx([fill(comment, '답')]))).rejects.toMatchObject({
      code: 'VELOG_MODEL_UNAVAILABLE',
    });
  });

  test('discard는 본문과 결과 파일을 함께 버린다', async () => {
    const { runner, ctx, read } = setup(createScriptedAdapter(() => FILLED));
    const context = ctx([{ question: comment, answer: { id: comment.id, kind: 'keep' } }]);
    await runner.run(context);
    await runner.discard?.(context);
    expect(await read(VELOG_ARTIFACT)).toBeUndefined();
    expect(await read(REVIEW_RESULT_ARTIFACT)).toBeUndefined();
  });
});
