// 모델은 스크립트 어댑터, 본문은 임시 DATA_DIR의 ArtifactStore, 어투는 tmpdir 폴더. DB·EvidenceStore 없음(본문에서만 파생).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildLinkedinPrompt,
  createLinkedinStepRunner,
  LINKEDIN_ARTIFACT,
} from './linkedinStep.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { WRITING_LIMITS } from './limits.ts';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { hashPromptText } from '../prompts/tonePrompts.ts';
import type { StepContext } from './StepRunner.ts';

let dir: string;
let artifacts: LocalFsArtifactStore;
let promptsDir: string;
const TONE = '# 링크드인 어투\n- -습니다체. 마지막 줄은 `글: [벨로그 링크]`.\n';
const BODY =
  '# 무한 스크롤 붙이기\n\n스토어 50개에서 목록이 멈췄다.\n\n```ts\nconst io = new IntersectionObserver(load);\n```\n\n<!-- [확인 필요] 응답 시간 -->\n';
const POST = '어느 날 목록이 멈췄습니다.\n\n1. 관찰자를 붙였습니다.\n\n글: [벨로그 링크]';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-linkedin-'));
  artifacts = new LocalFsArtifactStore(join(dir, 'data'));
  await artifacts.write('무한-스크롤', 'run_1', VELOG_ARTIFACT, BODY);
  await artifacts.write('무한-스크롤', 'run_0', VELOG_ARTIFACT, BODY); // carried 출처
  await artifacts.write('무한-스크롤', 'run_empty', VELOG_ARTIFACT, '  \n');
  promptsDir = join(dir, 'prompts');
  await mkdir(promptsDir, { recursive: true });
  await writeFile(join(promptsDir, 'linkedin.md'), TONE);
  await writeFile(join(promptsDir, 'velog.md'), '# 벨로그 어투\n'); // 다른 단계 파일은 안 쓴다
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ctx = (over: Partial<StepContext> = {}): StepContext => ({
  runId: 'run_1',
  step: 'linkedin',
  topic: { id: 't1', title: '무한 스크롤 (spacehome, react-router)', slug: '무한-스크롤' },
  modelId: 'mock:scripted',
  sources: {},
  signal: new AbortController().signal,
  ...over,
});
const adapters = (adapter = createScriptedAdapter(() => POST)) => ({
  adapter,
  get: (id: string) => (id === adapter.id ? adapter : undefined),
});
const deps = (over: Partial<Parameters<typeof createLinkedinStepRunner>[0]> = {}) => ({
  artifacts,
  promptsDir,
  adapters: adapters(),
  ...over,
});

describe('buildLinkedinPrompt', () => {
  test('system = 고정 머리 + 어투, user = 주제·지시·벨로그 본문(펜스 안). 근거 번들 자리 없음', () => {
    const { system, prompt } = buildLinkedinPrompt({
      topic: { title: '무한 스크롤 (spacehome)', slug: 's' },
      body: BODY,
      tone: { step: 'linkedin', text: TONE, hash: hashPromptText(TONE) },
      instruction: '삽질 문단을 늘려',
    });
    expect(system.endsWith(TONE)).toBe(true);
    expect(system).toContain('[벨로그 링크]');
    expect(system).toContain('벨로그 본문'); // 사실의 출처는 본문뿐
    expect(prompt).toContain('# 주제\n무한 스크롤\n');
    expect(prompt).not.toContain('spacehome');
    expect(prompt).toContain('# 수정 지시(재실행)\n삽질 문단을 늘려');
    // 본문의 ```보다 긴 펜스로 감싼다
    expect(prompt).toContain('# 벨로그 본문(이것이 사실의 전부)\n````\n# 무한 스크롤 붙이기');
    expect(prompt).toContain('<!-- [확인 필요] 응답 시간 -->\n````\n');
    expect(prompt).not.toContain('근거 묶음');
    expect(prompt).not.toContain(dir);
    const noInstruction = buildLinkedinPrompt({
      topic: { title: 't', slug: 's' },
      body: 'plain',
      tone: { step: 'linkedin', text: TONE, hash: 'h' },
    }).prompt;
    expect(noInstruction).not.toContain('수정 지시');
    expect(noInstruction).toContain('\n```\nplain\n```\n');
  });
});

describe('createLinkedinStepRunner', () => {
  test('velog.md·어투로 모델을 부르고 linkedin.md·토큰·비용·모델·promptHash를 돌려준다', async () => {
    const a = adapters();
    const runner = createLinkedinStepRunner(deps({ adapters: a }));
    const r = await runner.run(ctx());
    expect(r.artifacts[LINKEDIN_ARTIFACT]).toBe(`${POST}\n`);
    expect(await artifacts.read('무한-스크롤', 'run_1', LINKEDIN_ARTIFACT)).toEqual({
      ok: true,
      text: `${POST}\n`,
    });
    // velog.md는 건드리지 않는다
    expect(await artifacts.read('무한-스크롤', 'run_1', VELOG_ARTIFACT)).toEqual({
      ok: true,
      text: BODY,
    });
    await runner.discard!({ runId: 'run_1', step: 'linkedin', topic: ctx().topic });
    expect(await artifacts.read('무한-스크롤', 'run_1', LINKEDIN_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
    expect(await artifacts.read('무한-스크롤', 'run_1', VELOG_ARTIFACT)).toMatchObject({
      ok: true,
    });
    expect(r.model).toBe('mock:scripted');
    expect(r.promptHash).toBe(hashPromptText(TONE)); // linkedin.md의 해시(velog.md 아님)
    expect(r.tokens?.input).toBeGreaterThan(0);
    expect(r.costUsd).toBe(0.001);
    const call = a.adapter.calls[0]!;
    expect(call.system?.endsWith(TONE)).toBe(true);
    expect(call.prompt).toContain('스토어 50개에서 목록이 멈췄다.');
    expect(call.prompt).not.toContain('spacehome');
    expect(call.maxOutputTokens).toBe(WRITING_LIMITS.linkedinMaxOutputTokens);
  });

  test('carried 본문은 sources.velog의 Run 산출물을 읽고, 결과는 이 Run에 쓴다', async () => {
    const a = adapters();
    const r = await createLinkedinStepRunner(deps({ adapters: a })).run(
      ctx({ runId: 'run_9', sources: { velog: 'run_0', evidence: 'run_0' } }),
    );
    expect(a.adapter.calls).toHaveLength(1);
    expect(r.artifacts[LINKEDIN_ARTIFACT]).toBe(`${POST}\n`);
    expect(await artifacts.read('무한-스크롤', 'run_9', LINKEDIN_ARTIFACT)).toMatchObject({
      ok: true,
    });
    expect(await artifacts.read('무한-스크롤', 'run_0', LINKEDIN_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
  });

  test('실패는 StepFailure로 — 모델 없음·키 없음·어투 없음·본문 없음·본문 빈 것·잘림은 재시도 불가, 빈 출력은 재시도', async () => {
    const run = (
      over: Partial<Parameters<typeof createLinkedinStepRunner>[0]> = {},
      c: StepContext = ctx(),
    ) => createLinkedinStepRunner(deps(over)).run(c);
    await expect(run({}, ctx({ modelId: 'nope' }))).rejects.toMatchObject({
      code: 'LINKEDIN_MODEL_UNKNOWN',
      retryable: false,
    });
    const unavailable = { ...createScriptedAdapter(() => ''), available: false };
    await expect(
      run({ adapters: { get: () => unavailable } }, ctx({ modelId: unavailable.id })),
    ).rejects.toMatchObject({ code: 'LINKEDIN_MODEL_UNAVAILABLE' });
    const noTone = await run({ promptsDir: join(dir, 'no-prompts') }).catch((e: unknown) => e);
    expect(noTone).toMatchObject({ code: 'PROMPT_NOT_FOUND', retryable: false });
    expect((noTone as Error).message).toContain('linkedin.md');
    expect((noTone as Error).message).not.toContain(dir);
    await expect(run({}, ctx({ runId: 'run_missing' }))).rejects.toMatchObject({
      code: 'LINKEDIN_BODY_MISSING',
      retryable: false,
    });
    await expect(run({}, ctx({ runId: 'run_empty' }))).rejects.toMatchObject({
      code: 'LINKEDIN_BODY_EMPTY',
      retryable: false,
    });
    await expect(
      run({ adapters: adapters(createScriptedAdapter(() => '   ')) }),
    ).rejects.toMatchObject({ code: 'LINKEDIN_OUTPUT_EMPTY', retryable: true });
    const truncating = {
      ...createScriptedAdapter(() => ''),
      generate: async () => ({
        text: '잘린 글',
        usage: { inputTokens: 1, outputTokens: 1 },
        costUsd: 0,
        durationMs: 1,
        truncated: true,
      }),
    };
    await expect(
      run({ adapters: { get: () => truncating } }, ctx({ modelId: truncating.id })),
    ).rejects.toMatchObject({ code: 'LINKEDIN_OUTPUT_TRUNCATED', retryable: false });
    const failing = createScriptedAdapter(() => {
      throw Object.assign(new Error('boom'), { status: 503 });
    });
    await expect(run({ adapters: adapters(failing) })).rejects.toMatchObject({
      code: 'LINKEDIN_MODEL_FAILED',
      retryable: true,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(run({}, ctx({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(run({}, ctx({ step: 'velog' }))).rejects.toThrow('라우팅');
  });

  test('호출 중 종료 신호가 오면 즉시 AbortError로 반환하고 늦은 결과는 버린다, 전체 펜스 출력은 벗긴다', async () => {
    const controller = new AbortController();
    let resolveLater: (v: string) => void = () => {};
    const hanging = createScriptedAdapter(() => new Promise<string>((res) => (resolveLater = res)));
    const pending = createLinkedinStepRunner(deps({ adapters: adapters(hanging) })).run(
      ctx({ runId: 'run_abort', sources: { velog: 'run_1' }, signal: controller.signal }),
    );
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolveLater('늦은 결과');
    expect(await artifacts.read('무한-스크롤', 'run_abort', LINKEDIN_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });

    const wrapped = createScriptedAdapter(() => '```\n어느 날.\n\n글: [벨로그 링크]\n```');
    const r = await createLinkedinStepRunner(deps({ adapters: adapters(wrapped) })).run(ctx());
    expect(r.artifacts[LINKEDIN_ARTIFACT]).toBe('어느 날.\n\n글: [벨로그 링크]\n');
  });
});
