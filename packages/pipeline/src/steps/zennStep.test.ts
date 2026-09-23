// 모델은 스크립트 어댑터, 본문은 임시 DATA_DIR의 ArtifactStore, 어투는 tmpdir 폴더. DB·EvidenceStore 없음(본문에서만 파생).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildZennPrompt,
  createZennStepRunner,
  renderZennArticle,
  splitTitle,
  stripFrontmatter,
  ZENN_ARTIFACT,
  ZENN_FRONTMATTER,
} from './zennStep.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { WRITING_LIMITS } from './limits.ts';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { hashPromptText } from '../prompts/tonePrompts.ts';
import type { StepContext } from './StepRunner.ts';

let dir: string;
let artifacts: LocalFsArtifactStore;
let promptsDir: string;
const TONE = '# Zenn トーン\n- です・ます調。最後は「[velogリンク]」。\n';
const BODY =
  '# 무한 스크롤 붙이기\n\n스토어 50개에서 목록이 멈췄다.\n\n```ts\nconst io = new IntersectionObserver(load);\n```\n\n<!-- [확인 필요] 응답 시간 -->\n';
const ARTICLE =
  '# 無限スクロールを付けた話\n\n## はじめに\n\nストア50件で一覧が止まりました。\n\n```ts\nconst io = new IntersectionObserver(load); // 監視\n```\n\n---\n韓国語版はこちら：[velogリンク]';
const EXPECTED_FM =
  '---\ntitle: "無限スクロールを付けた話"\nemoji: "📝"\ntype: "tech"\ntopics: []\npublished: false\n---\n\n';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-zenn-'));
  artifacts = new LocalFsArtifactStore(join(dir, 'data'));
  await artifacts.write('無限-scroll', 'run_1', VELOG_ARTIFACT, BODY);
  await artifacts.write('無限-scroll', 'run_0', VELOG_ARTIFACT, BODY); // carried 출처
  await artifacts.write('無限-scroll', 'run_empty', VELOG_ARTIFACT, '  \n');
  promptsDir = join(dir, 'prompts');
  await mkdir(promptsDir, { recursive: true });
  await writeFile(join(promptsDir, 'zenn.md'), TONE);
  await writeFile(join(promptsDir, 'velog.md'), '# 벨로그 어투\n'); // 다른 단계 파일은 안 쓴다
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ctx = (over: Partial<StepContext> = {}): StepContext => ({
  runId: 'run_1',
  step: 'zenn',
  topic: { id: 't1', title: '무한 스크롤 (spacehome, react-router)', slug: '無限-scroll' },
  modelId: 'mock:scripted',
  sources: {},
  signal: new AbortController().signal,
  ...over,
});
const adapters = (adapter = createScriptedAdapter(() => ARTICLE)) => ({
  adapter,
  get: (id: string) => (id === adapter.id ? adapter : undefined),
});
const deps = (over: Partial<Parameters<typeof createZennStepRunner>[0]> = {}) => ({
  artifacts,
  promptsDir,
  adapters: adapters(),
  ...over,
});
const run = (
  over: Partial<Parameters<typeof createZennStepRunner>[0]> = {},
  c: StepContext = ctx(),
) => createZennStepRunner(deps(over)).run(c);

describe('buildZennPrompt', () => {
  test('system = 고정 머리 + 어투, user = 주제·지시·벨로그 본문(펜스 안). 근거 번들 자리 없음', () => {
    const { system, prompt } = buildZennPrompt({
      topic: { title: '무한 스크롤 (spacehome)', slug: 's' },
      body: BODY,
      tone: { step: 'zenn', text: TONE, hash: hashPromptText(TONE) },
      instruction: 'まとめを短く',
    });
    expect(system.endsWith(TONE)).toBe(true);
    expect(system).toContain('frontmatter'); // 모델이 만들지 않게
    expect(system).toContain('[velogリンク]');
    expect(prompt).toContain('# 주제\n무한 스크롤\n');
    expect(prompt).not.toContain('spacehome');
    expect(prompt).toContain('# 수정 지시(재실행)\nまとめを短く');
    expect(prompt).toContain('# 벨로그 본문(이것이 사실의 전부)\n````\n# 무한 스크롤 붙이기');
    expect(prompt).not.toContain('근거 묶음');
    expect(prompt).not.toContain(dir);
    expect(prompt).not.toContain(process.env['HOME'] ?? '/Users');
    expect(
      buildZennPrompt({
        topic: { title: 't', slug: 's' },
        body: 'p',
        tone: { step: 'zenn', text: TONE, hash: 'h' },
      }).prompt,
    ).not.toContain('수정 지시');
  });
});

describe('frontmatter 조립', () => {
  test('stripFrontmatter는 맨 앞 --- 블록만 버리고, splitTitle은 첫 # 줄을 제목으로 뗀다(없으면 대비책)', () => {
    expect(stripFrontmatter('---\ntitle: x\npublished: true\n---\n# 제목\n본문')).toBe(
      '# 제목\n본문',
    );
    expect(stripFrontmatter('---\r\ntitle: x\r\n---\r\n본문')).toBe('본문');
    expect(stripFrontmatter('# 제목\n---\n구분선\n---\n')).toBe('# 제목\n---\n구분선\n---\n'); // 본문 속 구분선은 그대로
    expect(stripFrontmatter('---\ntitle: x\n---')).toBe('');
    // 두 번 온 블록·빈 블록은 전부 버리고, key: 줄이 없는 블록은 본문의 구분선이라 보존한다
    expect(stripFrontmatter('---\ntitle: x\n---\n---\npublished: true\n---\n本文')).toBe('本文');
    expect(stripFrontmatter('---\n---\n本文')).toBe('本文');
    expect(stripFrontmatter('---\n本文の段落\n---\n続き')).toBe('---\n本文の段落\n---\n続き');
    expect(splitTitle('# 제목 — 부제\n\n본문', 'f')).toEqual({
      title: '제목 — 부제',
      body: '본문',
    });
    expect(splitTitle('본문만', 'f')).toEqual({ title: 'f', body: '본문만' });
    expect(splitTitle('#   \n본문', 'f')).toEqual({ title: 'f', body: '#   \n본문' });
    expect(splitTitle('## 소제목\n본문', 'f')).toEqual({ title: 'f', body: '## 소제목\n본문' });
    // 앞쪽 빈 줄·HTML 주석은 건너뛰어 찾고 본문에 남긴다, 닫는 #은 뗀다, CRLF도 같다
    expect(splitTitle('\n<!-- [挿絵] a.png -->\n# 題 #\n\n本文', 'f')).toEqual({
      title: '題',
      body: '<!-- [挿絵] a.png -->\n本文',
    });
    expect(splitTitle('  # 들여쓴 제목\n본문', 'f')).toEqual({
      title: '들여쓴 제목',
      body: '본문',
    });
    expect(splitTitle('# 題\r\n\r\n本文\r\n', 'f')).toEqual({ title: '題', body: '本文\r\n' });
  });

  test('renderZennArticle — published: false 고정, 제목은 따옴표·콜론이 있어도 안전, topics 빈 배열', () => {
    const out = renderZennArticle('A: "B" — C', '本文');
    expect(out).toBe(
      '---\ntitle: "A: \\"B\\" — C"\nemoji: "📝"\ntype: "tech"\ntopics: []\npublished: false\n---\n\n本文\n',
    );
    expect(ZENN_FRONTMATTER.published).toBe(false);
    expect(renderZennArticle('a\\b\nc # d', 'x')).toContain('title: "a\\\\b\\nc # d"\n');
  });
});

describe('createZennStepRunner', () => {
  test('velog.md·어투로 모델을 부르고 frontmatter(published: false) + 본문을 zenn.md로 돌려준다', async () => {
    const a = adapters();
    const runner = createZennStepRunner(deps({ adapters: a }));
    const r = await runner.run(ctx());
    const expected = `${EXPECTED_FM}${ARTICLE.slice('# 無限スクロールを付けた話\n\n'.length)}\n`;
    expect(r.artifacts[ZENN_ARTIFACT]).toBe(expected);
    expect(r.artifacts[ZENN_ARTIFACT]!.startsWith('---\n')).toBe(true);
    expect(r.artifacts[ZENN_ARTIFACT]).toContain('\npublished: false\n');
    expect(r.artifacts[ZENN_ARTIFACT]).not.toContain('\n# 無限スクロール'); // H1은 frontmatter로 옮겨짐
    expect(r.artifacts[ZENN_ARTIFACT]).toContain('// 監視'); // 코드는 그대로
    expect(await artifacts.read('無限-scroll', 'run_1', ZENN_ARTIFACT)).toEqual({
      ok: true,
      text: expected,
    });
    expect(await artifacts.read('無限-scroll', 'run_1', VELOG_ARTIFACT)).toEqual({
      ok: true,
      text: BODY,
    }); // 불변
    await runner.discard!({ runId: 'run_1', step: 'zenn', topic: ctx().topic });
    expect(await artifacts.read('無限-scroll', 'run_1', ZENN_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
    expect(r.model).toBe('mock:scripted');
    expect(r.promptHash).toBe(hashPromptText(TONE)); // zenn.md의 해시
    expect(r.tokens?.input).toBeGreaterThan(0);
    expect(r.costUsd).toBe(0.001);
    const call = a.adapter.calls[0]!;
    expect(call.system?.endsWith(TONE)).toBe(true);
    expect(call.prompt).toContain('스토어 50개에서 목록이 멈췄다.');
    expect(call.prompt).not.toContain('spacehome');
    expect(call.maxOutputTokens).toBe(WRITING_LIMITS.zennMaxOutputTokens);
  });

  test('모델이 frontmatter(published: true)나 전체 펜스를 내도 버리고 published: false로 덮어쓴다', async () => {
    const sneaky = createScriptedAdapter(
      () =>
        '```markdown\n---\ntitle: "偽"\nemoji: "🚀"\npublished: true\n---\n# 本題\n\n本文です。\n```',
    );
    const r = await run({ adapters: adapters(sneaky) });
    expect(r.artifacts[ZENN_ARTIFACT]).toBe(
      `${EXPECTED_FM.replace('無限スクロールを付けた話', '本題')}本文です。\n`,
    );
    expect(r.artifacts[ZENN_ARTIFACT]).not.toContain('published: true');
    expect(r.artifacts[ZENN_ARTIFACT]).not.toContain('🚀');
    expect((r.artifacts[ZENN_ARTIFACT]!.match(/^---$/gm) ?? []).length).toBe(2);
  });

  test('H1 뒤에 온 frontmatter도 버리고, 구분선으로 시작하는 본문은 보존하고, CRLF 출력은 LF로 통일한다', async () => {
    const afterTitle = await run({
      adapters: adapters(createScriptedAdapter(() => '# 題\n---\npublished: true\n---\n本文。')),
    });
    expect(afterTitle.artifacts[ZENN_ARTIFACT]).toBe(
      `${EXPECTED_FM.replace('無限スクロールを付けた話', '題')}本文。\n`,
    );
    const divider = await run({
      adapters: adapters(createScriptedAdapter(() => '# 題\n\n---\n第一段落\n---\n続き')),
    });
    expect(divider.artifacts[ZENN_ARTIFACT]).toContain('\n\n---\n第一段落\n---\n続き\n');
    const crlf = await run({
      adapters: adapters(createScriptedAdapter(() => '# 題\r\n\r\n一行目\r\n二行目\r\n')),
    });
    expect(crlf.artifacts[ZENN_ARTIFACT]).not.toContain('\r');
    expect(crlf.artifacts[ZENN_ARTIFACT]).toContain('\n\n一行目\n二行目\n');
  });

  test('첫 줄이 제목이 아니면 힌트 뗀 주제 제목을 대비책으로 쓴다', async () => {
    const r = await run({
      adapters: adapters(createScriptedAdapter(() => '## はじめに\n\n本文。')),
    });
    expect(r.artifacts[ZENN_ARTIFACT]).toContain('title: "무한 스크롤"\n');
    expect(r.artifacts[ZENN_ARTIFACT]).toContain('\n## はじめに\n');
    // 대비책도 비어 있으면(제목이 괄호 힌트뿐) 재시도 실패
    await expect(
      run(
        { adapters: adapters(createScriptedAdapter(() => '## はじめに\n\n本文。')) },
        ctx({ topic: { id: 't1', title: '(spacehome)', slug: '無限-scroll' } }),
      ),
    ).rejects.toMatchObject({ code: 'ZENN_TITLE_MISSING', retryable: true });
  });

  test('carried 본문은 sources.velog의 Run 산출물을 읽고, 결과는 이 Run에 쓴다. 러너는 ctx.instruction을 넣는다', async () => {
    const a = adapters();
    await createZennStepRunner(deps({ adapters: a })).run(
      ctx({
        runId: 'run_9',
        sources: { velog: 'run_0', evidence: 'run_0' },
        instruction: 'まとめを短く',
      }),
    );
    expect(a.adapter.calls).toHaveLength(1);
    expect(a.adapter.calls[0]!.prompt).toContain('# 수정 지시(재실행)\nまとめを短く');
    expect(await artifacts.read('無限-scroll', 'run_9', ZENN_ARTIFACT)).toMatchObject({ ok: true });
    expect(await artifacts.read('無限-scroll', 'run_0', ZENN_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
  });

  test('실패는 StepFailure로 — 모델 없음·키 없음·어투 없음·본문 없음·못 읽음·빈 본문·잘림·401·저장 실패는 재시도 불가, 빈 출력·제목만·503은 재시도', async () => {
    await expect(run({}, ctx({ modelId: 'nope' }))).rejects.toMatchObject({
      code: 'ZENN_MODEL_UNKNOWN',
      retryable: false,
    });
    const unavailable = { ...createScriptedAdapter(() => ''), available: false };
    await expect(
      run({ adapters: { get: () => unavailable } }, ctx({ modelId: unavailable.id })),
    ).rejects.toMatchObject({
      code: 'ZENN_MODEL_UNAVAILABLE',
    });
    const noTone = await run({ promptsDir: join(dir, 'no-prompts') }).catch((e: unknown) => e);
    expect(noTone).toMatchObject({ code: 'PROMPT_NOT_FOUND', retryable: false });
    expect((noTone as Error).message).toContain('zenn.md');
    expect((noTone as Error).message).not.toContain(dir);
    await expect(run({}, ctx({ runId: 'run_missing' }))).rejects.toMatchObject({
      code: 'ZENN_BODY_MISSING',
      retryable: false,
    });
    await mkdir(artifacts.pathFor('無限-scroll', 'run_dir', VELOG_ARTIFACT), { recursive: true });
    await expect(run({}, ctx({ runId: 'run_dir' }))).rejects.toMatchObject({
      code: 'ZENN_BODY_UNREADABLE',
      retryable: false,
    });
    await expect(run({}, ctx({ runId: 'run_empty' }))).rejects.toMatchObject({
      code: 'ZENN_BODY_EMPTY',
      retryable: false,
    });
    await expect(
      run({ adapters: adapters(createScriptedAdapter(() => '   ')) }),
    ).rejects.toMatchObject({
      code: 'ZENN_OUTPUT_EMPTY',
      retryable: true,
    });
    await expect(
      run({ adapters: adapters(createScriptedAdapter(() => '---\npublished: true\n---\n')) }),
    ).rejects.toMatchObject({
      code: 'ZENN_OUTPUT_EMPTY',
    });
    await expect(
      run({ adapters: adapters(createScriptedAdapter(() => '# 題だけ\n')) }),
    ).rejects.toMatchObject({
      code: 'ZENN_OUTPUT_EMPTY',
      retryable: true,
    });
    const truncating = {
      ...createScriptedAdapter(() => ''),
      generate: async () => ({
        text: '途中',
        usage: { inputTokens: 1, outputTokens: 1 },
        costUsd: 0,
        durationMs: 1,
        truncated: true,
      }),
    };
    await expect(
      run({ adapters: { get: () => truncating } }, ctx({ modelId: truncating.id })),
    ).rejects.toMatchObject({
      code: 'ZENN_OUTPUT_TRUNCATED',
      retryable: false,
    });
    const failing = createScriptedAdapter(() => {
      throw Object.assign(new Error('boom'), { status: 503 });
    });
    await expect(run({ adapters: adapters(failing) })).rejects.toMatchObject({
      code: 'ZENN_MODEL_FAILED',
      retryable: true,
    });
    const unauthorized = createScriptedAdapter(() => {
      throw Object.assign(new Error('unauthorized'), { status: 401 });
    });
    await expect(run({ adapters: adapters(unauthorized) })).rejects.toMatchObject({
      code: 'ZENN_MODEL_FAILED',
      retryable: false,
    });
    const refusing = createScriptedAdapter(() => {
      throw new Error('모델이 응답을 거부했습니다 (stop_reason refusal)');
    });
    const refusal = await run({ adapters: adapters(refusing) }).catch((e: unknown) => e);
    expect(refusal).toMatchObject({ code: 'ZENN_MODEL_FAILED', retryable: false });
    expect((refusal as Error).message).toContain('거부');
    const writeFailure = await run({
      artifacts: {
        ...artifacts,
        read: artifacts.read.bind(artifacts),
        remove: artifacts.remove.bind(artifacts),
        write: async () => {
          throw new Error('EACCES: permission denied, open /abs/data/x');
        },
      },
    }).catch((e: unknown) => e);
    expect(writeFailure).toMatchObject({ code: 'ZENN_STORE_WRITE_FAILED', retryable: false });
    expect((writeFailure as Error).message).not.toContain('/abs/data');
    expect((writeFailure as Error).cause).toBeInstanceOf(Error);
    const controller = new AbortController();
    controller.abort();
    await expect(run({}, ctx({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(run({}, ctx({ step: 'linkedin' }))).rejects.toThrow('라우팅');
  });

  test('호출 중 종료 신호가 오면 즉시 AbortError로 반환하고 늦은 결과는 버린다', async () => {
    const controller = new AbortController();
    let resolveLater: (v: string) => void = () => {};
    const hanging = createScriptedAdapter(() => new Promise<string>((res) => (resolveLater = res)));
    const pending = run(
      { adapters: adapters(hanging) },
      ctx({ runId: 'run_abort', sources: { velog: 'run_1' }, signal: controller.signal }),
    );
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolveLater('遅い結果');
    expect(await artifacts.read('無限-scroll', 'run_abort', ZENN_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
  });
});
