// 모델은 스크립트 어댑터(JSON 판정), 본문은 ArtifactStore, 번들은 EvidenceStore — 둘 다 임시 DATA_DIR. DB 없음.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildJudgePrompt,
  createVerifyStepRunner,
  parseJudgments,
  sanitizeNote,
  VERIFICATION_ARTIFACT,
} from './verifyStep.ts';
import { VELOG_ARTIFACT } from './velogStep.ts';
import { VERIFY_LIMITS } from '../evidence/verifyLimits.ts';
import type { VerificationReport } from '../evidence/verification.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import { LocalFsArtifactStore } from '../artifacts/ArtifactStore.ts';
import type { EvidenceBundle } from '../evidence/bundle.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import type { StepContext } from './StepRunner.ts';

let dir: string;
let store: LocalFsEvidenceStore;
let artifacts: LocalFsArtifactStore;
const SLUG = '무한-스크롤';
const BUNDLE: EvidenceBundle = {
  version: 1,
  runId: 'run_1',
  topicId: 't1',
  topicSlug: SLUG,
  collectedAt: '2026-09-23T00:00:00.000Z',
  items: [
    {
      commit: 'abcdef1234567',
      path: 'src/scroll.ts',
      lineRange: { start: 1, end: 3 },
      date: '2024-03-05T10:00:00+09:00',
      note: '스토어 50개 기준',
      source: 'linked',
      redacted: true,
      truncated: false,
      snippet:
        'export const PAGE_SIZE = 20;\nconst io = new IntersectionObserver(loadNextPage);\nio.observe(sentinel);',
    },
  ],
  analyses: [],
  unreadable: 0,
  filtered: true,
};
// 완료조건 픽스처: 근거 있는 숫자 2(50개·20) + 없는 숫자 1(12%)
const BODY = `# 무한 스크롤

스토어 50개에서 목록이 멈췄다. 페이지 크기는 20으로 두었다. 실패율은 12%였다.

빠른 결정이었다고 생각한다.
`;
const JUDGE_JSON =
  '{"judgments":[{"id":1,"status":"supported","reason":"note에 50개"},{"id":2,"status":"supported","reason":"PAGE_SIZE 20"},{"id":3,"status":"unsupported","reason":"실패율 근거 없음"},{"id":4,"status":"uncertain","reason":"소감"}]}';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-verify-'));
  store = new LocalFsEvidenceStore(join(dir, 'data'));
  artifacts = new LocalFsArtifactStore(join(dir, 'data'));
  await store.write(BUNDLE);
  await store.write({ ...BUNDLE, runId: 'run_0' }); // carried 출처
  await artifacts.write(SLUG, 'run_1', VELOG_ARTIFACT, BODY);
  await artifacts.write(SLUG, 'run_0', VELOG_ARTIFACT, BODY);
  await artifacts.write(SLUG, 'run_nostmt', VELOG_ARTIFACT, '# 제목\n\n- 50개\n- 12%\n');
  await artifacts.write(SLUG, 'run_empty', VELOG_ARTIFACT, ' \n');
  await store.write({ ...BUNDLE, runId: 'run_nostmt' });
  await store.write({ ...BUNDLE, runId: 'run_empty' });
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const ctx = (over: Partial<StepContext> = {}): StepContext => ({
  runId: 'run_1',
  step: 'verify',
  topic: { id: 't1', title: '무한 스크롤 (spacehome)', slug: SLUG },
  modelId: 'mock:scripted',
  sources: {},
  signal: new AbortController().signal,
  ...over,
});
const adapters = (adapter = createScriptedAdapter(() => JUDGE_JSON)) => ({
  adapter,
  get: (id: string) => (id === adapter.id ? adapter : undefined),
});
const FIXED_NOW = new Date('2026-09-24T01:02:03.000Z');
const deps = (over: Partial<Parameters<typeof createVerifyStepRunner>[0]> = {}) => ({
  store,
  artifacts,
  adapters: adapters(),
  clock: { now: () => FIXED_NOW },
  ...over,
});
const run = (
  over: Partial<Parameters<typeof createVerifyStepRunner>[0]> = {},
  c: StepContext = ctx(),
) => createVerifyStepRunner(deps(over)).run(c);
const reportOf = (r: { artifacts: Record<string, string> }): VerificationReport =>
  JSON.parse(r.artifacts[VERIFICATION_ARTIFACT]!) as VerificationReport;

describe('buildJudgePrompt · parseJudgments', () => {
  test('프롬프트 = 요약·근거 조각(펜스)·번호 붙은 문장, 판정 파서는 형식 밖을 걸러낸다', () => {
    const { system, prompt } = buildJudgePrompt(
      { ...BUNDLE, analyses: [{ id: 'a', kind: 'area', title: 't', summary: 's' }] },
      [{ text: '문장 하나다.', kind: 'statement', status: 'uncertain', line: 1 }],
      1000,
    );
    expect(system).toContain('supported / unsupported / uncertain');
    expect(prompt).toContain('- [area] t: s');
    expect(prompt).toContain('## 조각 1 — src/scroll.ts L1-3');
    expect(prompt).toContain('# 판정할 문장(1개)\n1. 문장 하나다.');
    expect(prompt).not.toContain(dir);
    const parsed = parseJudgments(
      '설명\n```json\n{"judgments":[{"id":1,"status":"supported","reason":" r "},{"id":2,"status":"maybe"},{"id":"3","status":"uncertain"},{"status":"supported"}]}\n```',
    );
    expect([...parsed!.entries()]).toEqual([[1, { status: 'supported', note: 'r' }]]);
    // 같은 id가 두 번 오면 첫 것, id 1.0은 정수
    expect([
      ...parseJudgments(
        '{"judgments":[{"id":1.0,"status":"supported"},{"id":1,"status":"unsupported"}]}',
      )!.entries(),
    ]).toEqual([[1, { status: 'supported' }]]);
    expect(parseJudgments('{"nope":1}')).toBeUndefined();
    expect(parseJudgments('not json')).toBeUndefined();
  });
});

describe('createVerifyStepRunner', () => {
  test('완료조건: 숫자 supported 2 · unsupported 1, 서술은 모델 판정, verification.json·flags·토큰을 돌려준다', async () => {
    const a = adapters();
    const runner = createVerifyStepRunner(deps({ adapters: a }));
    const r = await runner.run(ctx());
    const report = reportOf(r);
    const numbers = report.claims.filter((c) => c.kind === 'number');
    expect(numbers.map((c) => [c.text, c.status])).toEqual([
      ['50개', 'supported'],
      ['20', 'supported'],
      ['12%', 'unsupported'],
    ]);
    expect(numbers[0]!.evidenceRef).toEqual({
      commit: 'abcdef1234567',
      path: 'src/scroll.ts',
      lineRange: { start: 1, end: 3 },
    });
    const statements = report.claims.filter((c) => c.kind === 'statement');
    expect(statements.map((c) => [c.text, c.status, c.reason, c.note])).toEqual([
      ['스토어 50개에서 목록이 멈췄다.', 'supported', 'judged', 'note에 50개'],
      ['페이지 크기는 20으로 두었다.', 'supported', 'judged', 'PAGE_SIZE 20'],
      ['실패율은 12%였다.', 'unsupported', 'judged', '실패율 근거 없음'],
      ['빠른 결정이었다고 생각한다.', 'uncertain', 'judged', '소감'],
    ]);
    expect(report.verifiedAt).toBe('2026-09-24T01:02:03.000Z'); // 주입한 시계
    expect(report.claims.map((c) => c.line)).toEqual(
      [...report.claims.map((c) => c.line)].sort((x, y) => x - y),
    );
    expect(report.counts).toEqual({ supported: 4, unsupported: 2, uncertain: 1 });
    expect(report.judge).toEqual({ status: 'judged', model: 'mock:scripted', statements: 4 });
    expect(report.sources).toEqual({ velog: 'run_1', evidence: 'run_1' });
    expect(report.cleanRoom).toEqual({ threshold: VERIFY_LIMITS.cleanRoomLines, matches: [] });
    expect(r.flags).toEqual({ unsupported: 2, uncertain: 1 });
    expect(r.model).toBe('mock:scripted');
    expect(r.tokens?.input).toBeGreaterThan(0);
    expect(r.costUsd).toBe(0.001);
    expect(r.promptHash).toBeUndefined(); // 어투 없음
    // 보고서에는 근거 조각 본문이 없다
    expect(r.artifacts[VERIFICATION_ARTIFACT]).not.toContain('IntersectionObserver');
    // 본문은 그대로, 보고서는 DATA_DIR에, discard가 지운다
    expect(await artifacts.read(SLUG, 'run_1', VELOG_ARTIFACT)).toEqual({ ok: true, text: BODY });
    expect(await artifacts.read(SLUG, 'run_1', VERIFICATION_ARTIFACT)).toMatchObject({ ok: true });
    await runner.discard!({ runId: 'run_1', step: 'verify', topic: ctx().topic });
    expect(await artifacts.read(SLUG, 'run_1', VERIFICATION_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
    const call = a.adapter.calls[0]!;
    expect(call.prompt).toContain('io.observe(sentinel);'); // 조각은 판정 프롬프트에 들어간다(DATA_DIR → 모델, 파일에는 안 남음)
    expect(call.prompt).toContain('4. 빠른 결정이었다고 생각한다.');
    expect(call.maxOutputTokens).toBe(VERIFY_LIMITS.judgeMaxOutputTokens);
  });

  test('서술이 없으면 모델을 부르지 않는다 — judge skipped, 토큰·모델 없음, 숫자 대조만', async () => {
    const a = adapters();
    const r = await run({ adapters: a }, ctx({ runId: 'run_nostmt' }));
    expect(a.adapter.calls).toHaveLength(0);
    expect(r.model).toBeUndefined();
    expect(r.tokens).toBeUndefined();
    const report = reportOf(r);
    expect(report.judge).toEqual({ status: 'skipped' });
    expect(report.counts).toEqual({ supported: 1, unsupported: 1, uncertain: 0 });
    expect(r.flags).toEqual({ unsupported: 1, uncertain: 0 });
  });

  test('판정 JSON이 깨지거나 잘려도 단계는 성공 — 서술 전부 uncertain, judge에 사유', async () => {
    const broken = await run({
      adapters: adapters(createScriptedAdapter(() => '판정을 못 하겠습니다')),
    });
    const b = reportOf(broken);
    expect(b.judge).toEqual({ status: 'unparsed', model: 'mock:scripted', statements: 4 });
    expect(
      b.claims
        .filter((c) => c.kind === 'statement')
        .every(
          (c) => c.status === 'uncertain' && c.reason === 'judge-unparsed' && c.note === undefined,
        ),
    ).toBe(true);
    expect(b.counts.unsupported).toBe(1); // 숫자 12%만
    const truncating = {
      ...createScriptedAdapter(() => ''),
      generate: async () => ({
        text: '{"judgments":[',
        usage: { inputTokens: 1, outputTokens: 1 },
        costUsd: 0,
        durationMs: 1,
        truncated: true,
      }),
    };
    const t = reportOf(
      await run({ adapters: { get: () => truncating } }, ctx({ modelId: truncating.id })),
    );
    expect(t.judge).toMatchObject({ status: 'truncated' });
    expect(
      t.claims.filter((c) => c.kind === 'statement').every((c) => c.reason === 'judge-truncated'),
    ).toBe(true);
    // 일부 id만 돌아오면 나머지는 uncertain(judge-missing)
    const partial = reportOf(
      await run({
        adapters: adapters(
          createScriptedAdapter(() => '{"judgments":[{"id":3,"status":"unsupported"}]}'),
        ),
      }),
    );
    const st = partial.claims.filter((c) => c.kind === 'statement');
    expect(st[2]).toMatchObject({ status: 'unsupported' });
    expect(st[0]).toMatchObject({ status: 'uncertain', reason: 'judge-missing' });
  });

  test('maxStatements를 넘는 문장은 모델에 보내지 않고 uncertain(not-judged)', async () => {
    const a = adapters(
      createScriptedAdapter(() => '{"judgments":[{"id":1,"status":"supported"}]}'),
    );
    const r = reportOf(await run({ adapters: a, limits: { ...VERIFY_LIMITS, maxStatements: 1 } }));
    expect(a.adapter.calls[0]!.prompt).toContain('# 판정할 문장(1개)');
    const st = r.claims.filter((c) => c.kind === 'statement');
    expect(st[0]!.status).toBe('supported');
    expect(st.slice(1).every((c) => c.status === 'uncertain' && c.reason === 'not-judged')).toBe(
      true,
    );
    expect(r.judge).toMatchObject({ statements: 1 });
  });

  test('carried 출처: sources.velog·sources.evidence의 Run을 읽고 보고서는 이 Run에, sources에 기록', async () => {
    const r = await run(
      {},
      ctx({ runId: 'run_9', sources: { velog: 'run_0', evidence: 'run_0' } }),
    );
    expect(reportOf(r).sources).toEqual({ velog: 'run_0', evidence: 'run_0' });
    expect(reportOf(r).runId).toBe('run_9');
    expect(await artifacts.read(SLUG, 'run_9', VERIFICATION_ARTIFACT)).toMatchObject({ ok: true });
    expect(await artifacts.read(SLUG, 'run_0', VERIFICATION_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
  });

  test('클린룸: 본문이 조각 3줄을 그대로 담으면 cleanRoom.matches에 위치만 남는다', async () => {
    await artifacts.write(
      SLUG,
      'run_copy',
      VELOG_ARTIFACT,
      `# 제목\n\n\`\`\`ts\n${BUNDLE.items[0]!.snippet}\n\`\`\`\n`,
    );
    await store.write({ ...BUNDLE, runId: 'run_copy' });
    const r = reportOf(await run({}, ctx({ runId: 'run_copy' })));
    expect(r.cleanRoom.matches).toEqual([
      {
        evidenceRef: {
          commit: 'abcdef1234567',
          path: 'src/scroll.ts',
          lineRange: { start: 1, end: 3 },
        },
        bodyLine: 4,
        snippetLine: 1,
        lines: 3,
      },
    ]);
  });

  test('H1: 모델 사유가 근거 조각 줄·note를 인용하면 사유를 버리고, 백틱 스팬은 떼고 120자로 자른다', async () => {
    const quoting = createScriptedAdapter(
      () =>
        '{"judgments":[' +
        '{"id":1,"status":"supported","reason":"코드에 const io = new IntersectionObserver(loadNextPage); 있음"},' +
        '{"id":2,"status":"supported","reason":"`export const PAGE_SIZE = 20;` 참고"},' +
        '{"id":3,"status":"unsupported","reason":"note는 스토어 50개 기준 뿐"},' +
        `{"id":4,"status":"uncertain","reason":"${'긴 사유 '.repeat(60)}"}]}`,
    );
    const r = await run({ adapters: adapters(quoting) });
    const st = reportOf(r).claims.filter((c) => c.kind === 'statement');
    expect(st[0]!.note).toBeUndefined(); // 조각 줄 그대로 → 폐기
    expect(st[1]!.note).toBe('참고'); // 백틱 스팬 제거 후 남은 것
    expect(st[2]!.note).toBeUndefined(); // note 인용 → 폐기
    expect(st[3]!.note!.length).toBeLessThanOrEqual(120);
    expect(st.map((c) => c.status)).toEqual(['supported', 'supported', 'unsupported', 'uncertain']); // 판정은 유지
    expect(r.artifacts[VERIFICATION_ARTIFACT]).not.toContain('IntersectionObserver');
    expect(r.artifacts[VERIFICATION_ARTIFACT]).not.toContain('PAGE_SIZE = 20');
    expect(sanitizeNote('  `x`  ', BUNDLE, 8)).toBeUndefined();
    expect(sanitizeNote('조각 1에 있음', BUNDLE, 8)).toBe('조각 1에 있음');
  });

  test('실패는 StepFailure로 — 모델 없음·키 없음·본문 없음/못 읽음/빈 것·번들 없음/깨짐·저장 실패는 재시도 불가, 판정 호출 503은 재시도', async () => {
    await expect(run({}, ctx({ modelId: 'nope' }))).rejects.toMatchObject({
      code: 'VERIFY_MODEL_UNKNOWN',
      retryable: false,
    });
    const unavailable = { ...createScriptedAdapter(() => ''), available: false };
    await expect(
      run({ adapters: { get: () => unavailable } }, ctx({ modelId: unavailable.id })),
    ).rejects.toMatchObject({
      code: 'VERIFY_MODEL_UNAVAILABLE',
      retryable: false,
    });
    await expect(run({}, ctx({ runId: 'run_missing' }))).rejects.toMatchObject({
      code: 'VERIFY_BODY_MISSING',
      retryable: false,
    });
    await mkdir(artifacts.pathFor(SLUG, 'run_dir', VELOG_ARTIFACT), { recursive: true });
    await expect(run({}, ctx({ runId: 'run_dir' }))).rejects.toMatchObject({
      code: 'VERIFY_BODY_UNREADABLE',
    });
    await expect(run({}, ctx({ runId: 'run_empty' }))).rejects.toMatchObject({
      code: 'VERIFY_BODY_EMPTY',
      retryable: false,
    });
    await artifacts.write(SLUG, 'run_nobundle', VELOG_ARTIFACT, BODY);
    await expect(run({}, ctx({ runId: 'run_nobundle' }))).rejects.toMatchObject({
      code: 'VERIFY_EVIDENCE_MISSING',
      retryable: false,
    });
    await artifacts.write(SLUG, 'run_broken', VELOG_ARTIFACT, BODY);
    await writeFile(store.pathFor(SLUG, 'run_broken'), '{ not json', 'utf8');
    await expect(run({}, ctx({ runId: 'run_broken' }))).rejects.toMatchObject({
      code: 'VERIFY_EVIDENCE_INVALID',
      retryable: false,
    });
    // 번들 자리가 디렉터리(EISDIR) → UNREADABLE
    await artifacts.write(SLUG, 'run_bdir', VELOG_ARTIFACT, BODY);
    await mkdir(store.pathFor(SLUG, 'run_bdir'), { recursive: true });
    await expect(run({}, ctx({ runId: 'run_bdir' }))).rejects.toMatchObject({
      code: 'VERIFY_EVIDENCE_UNREADABLE',
      retryable: false,
    });
    const failing = createScriptedAdapter(() => {
      throw Object.assign(new Error('boom'), { status: 503 });
    });
    await expect(run({ adapters: adapters(failing) })).rejects.toMatchObject({
      code: 'VERIFY_JUDGE_FAILED',
      retryable: true,
    });
    const writeFailure = await run({
      artifacts: {
        ...artifacts,
        read: artifacts.read.bind(artifacts),
        remove: artifacts.remove.bind(artifacts),
        write: async () => {
          throw new Error('EACCES /abs/data');
        },
      },
    }).catch((e: unknown) => e);
    expect(writeFailure).toMatchObject({ code: 'VERIFY_STORE_WRITE_FAILED', retryable: false });
    expect((writeFailure as Error).message).not.toContain('/abs/data');
    const controller = new AbortController();
    controller.abort();
    await expect(run({}, ctx({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(run({}, ctx({ step: 'velog' }))).rejects.toThrow('라우팅');
  });

  test('판정 호출 중 종료 신호가 오면 즉시 AbortError, 늦은 결과는 버리고 보고서를 쓰지 않는다', async () => {
    const controller = new AbortController();
    let resolveLater: (v: string) => void = () => {};
    const hanging = createScriptedAdapter(() => new Promise<string>((res) => (resolveLater = res)));
    const pending = run(
      { adapters: adapters(hanging) },
      ctx({
        runId: 'run_abort',
        sources: { velog: 'run_1', evidence: 'run_1' },
        signal: controller.signal,
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    resolveLater(JUDGE_JSON);
    expect(await artifacts.read(SLUG, 'run_abort', VERIFICATION_ARTIFACT)).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
  });
});
