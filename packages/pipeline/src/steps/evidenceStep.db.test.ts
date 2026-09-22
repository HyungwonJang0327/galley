// 통합: 픽스처 git 리포 + 임시 SQLite + 임시 DATA_DIR. 완료 조건 — 번들의 모든 snippet이 포인터가 가리키는 커밋의 파일
// 내용과 일치하고, posts 쪽 evidence.json에는 snippet 키가 없다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createEvidenceStepRunner, EVIDENCE_ARTIFACT } from './evidenceStep.ts';
import { LocalFsEvidenceStore } from '../evidence/EvidenceStore.ts';
import { EVIDENCE_LIMITS, type EvidenceLimits } from '../evidence/limits.ts';
import type { EvidencePointers } from '../evidence/bundle.ts';
import { gitShowFile } from '../index/gitRead.ts';
import { LINK_SOURCE, serializePointers } from '../index/schema.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import { StepFailure } from './StepRunner.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir: string;
let repoPath: string;
let head: string;
let prisma: PrismaClient;
let store: LocalFsEvidenceStore;

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t.test',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t.test',
  GIT_AUTHOR_DATE: '2024-03-05T10:00:00+09:00',
  GIT_COMMITTER_DATE: '2024-03-05T10:00:00+09:00',
};
const g = (...args: string[]) =>
  execFileSync('git', args, { cwd: repoPath, env: GIT_ENV, encoding: 'utf8' }).trim();
const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-evidence-step-'));
  repoPath = join(dir, 'repo');
  await mkdir(join(repoPath, 'src'), { recursive: true });
  await writeFile(
    join(repoPath, 'src', 'a.ts'),
    'export const a = 1; // Example Corp\nexport const b = 2;\nexport const c = 3;\n',
  );
  await writeFile(join(repoPath, 'src', 'b.ts'), 'export const secret = "Example Corp";\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoPath, env: GIT_ENV });
  g('add', '.');
  g('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
  head = g('rev-parse', 'HEAD');
  const url = `file:${join(dir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
  store = new LocalFsEvidenceStore(join(dir, 'data'));
});
beforeEach(async () => {
  await prisma.run.deleteMany();
  await prisma.topicAnalysisLink.deleteMany();
  await prisma.repoAnalysis.deleteMany();
  await prisma.repo.deleteMany();
  await prisma.queueItem.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

async function seed(readOnly: boolean) {
  const repo = await prisma.repo.create({ data: { name: 'fixture', path: repoPath, readOnly } });
  const area = await prisma.repoAnalysis.create({
    data: {
      repoId: repo.id,
      kind: 'area',
      key: 'area:src',
      title: 'src',
      summary: 's',
      modelId: 'mock',
      pointers: (
        serializePointers([
          {
            commit: head,
            path: 'src/a.ts',
            lineStart: 1,
            lineEnd: 2,
            note: 'entry (Example Corp)',
          },
          { commit: head, path: 'src/gone.ts' },
        ]) as { ok: true; text: string }
      ).text,
    },
  });
  const change = await prisma.repoAnalysis.create({
    data: {
      repoId: repo.id,
      kind: 'change',
      key: 'change:2024-03',
      title: 'c',
      summary: 's',
      modelId: 'mock',
      period: '2024-03',
      pointers: (
        serializePointers([
          { commit: head, path: 'src/b.ts' },
          { commit: head, path: 'src/a.ts', lineStart: 1, lineEnd: 2 }, // area와 같은 조각 → 중복 제거
        ]) as { ok: true; text: string }
      ).text,
    },
  });
  const topic = await prisma.queueItem.create({
    data: { title: '무한 스크롤', status: '대기', order: 0 },
  });
  await prisma.topicAnalysisLink.createMany({
    data: [
      { topicId: topic.id, analysisId: area.id, source: LINK_SOURCE.auto },
      { topicId: topic.id, analysisId: change.id, source: LINK_SOURCE.manual },
    ],
  });
  const run = await prisma.run.create({
    data: {
      topicId: topic.id,
      topicSlug: '무한-스크롤',
      topicTitle: '무한 스크롤',
      modelId: 'mock',
    },
  });
  return { repo, area, change, topic, run };
}
const ctxFor = (
  run: { id: string },
  topic: { id: string },
  signal = new AbortController().signal,
) => ({
  runId: run.id,
  step: 'evidence' as const,
  topic: { id: topic.id, title: '무한 스크롤', slug: '무한-스크롤' },
  signal,
});
const deps = (redactConfig: RedactConfig | null, limits: EvidenceLimits = EVIDENCE_LIMITS) => ({
  prisma,
  store,
  redactConfig,
  clock: { now: () => new Date('2026-09-22T00:00:00Z') },
  limits,
});

describe('evidence 단계', () => {
  test('linked 포인터를 읽어 DATA_DIR에 snippet 번들, artifacts에는 포인터만 — 모든 snippet이 커밋의 파일 내용과 일치', async () => {
    const { area, change, topic, run } = await seed(true);
    const runner = createEvidenceStepRunner(deps(REDACT));
    const result = await runner.run(ctxFor(run, topic));
    expect(result.model).toBeUndefined();
    expect(result.tokens).toBeUndefined();

    // posts 쪽: snippet 키·조각 내용이 없다
    const pointers = JSON.parse(result.artifacts[EVIDENCE_ARTIFACT]!) as EvidencePointers;
    expect(result.artifacts[EVIDENCE_ARTIFACT]).not.toContain('snippet');
    expect(result.artifacts[EVIDENCE_ARTIFACT]).not.toContain('export const');
    expect(pointers).toMatchObject({
      version: 1,
      runId: run.id,
      topicSlug: '무한-스크롤',
      unreadable: 1,
      filtered: true,
    });
    // manual(change) 먼저, 그다음 auto(area); 같은 조각은 한 번만; 없는 경로는 unreadable
    expect(
      pointers.items.map((i) => [i.analysisId, i.path, i.lineRange.start, i.lineRange.end]),
    ).toEqual([
      [change.id, 'src/b.ts', 1, 1],
      [change.id, 'src/a.ts', 1, 2],
    ]);
    expect(pointers.items.some((i) => i.analysisId === area.id)).toBe(false); // area의 조각은 중복(a.ts)·없음(gone.ts)

    // DATA_DIR 쪽: snippet이 있고 redact 됐으며 커밋의 파일 내용과 일치
    const stored = await store.read('무한-스크롤', run.id);
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.bundle.items.map((i) => i.source)).toEqual(['linked', 'linked']);
    for (const item of stored.bundle.items) {
      const shown = await gitShowFile(repoPath, item.commit, item.path);
      expect(shown.ok).toBe(true);
      if (!shown.ok) continue;
      const expected = shown.value
        .replace(/\n$/, '')
        .split('\n')
        .slice(item.lineRange.start - 1, item.lineRange.end)
        .join('\n')
        .replaceAll('Example Corp', '[COMPANY]');
      expect(item.snippet).toBe(expected);
      expect(item.date).toBe('2024-03-05T10:00:00+09:00');
    }
    expect(stored.bundle.items.every((i) => i.redacted)).toBe(true);
    expect(stored.bundle.items[1]!.note).toBeUndefined(); // change의 포인터엔 note가 없다
    const raw = await readFile(store.pathFor('무한-스크롤', run.id), 'utf8');
    expect(raw).not.toContain('Example Corp');
    // 리포는 읽기만
    expect(g('status', '--porcelain')).toBe('');
  });

  test('readOnly 리포 + 필터 없음은 EVIDENCE_REDACT_CONFIG_REQUIRED(재시도 불가), 아무것도 쓰지 않는다', async () => {
    const { topic, run } = await seed(true);
    await expect(
      createEvidenceStepRunner(deps(null)).run(ctxFor(run, topic)),
    ).rejects.toMatchObject({
      name: 'StepFailure',
      code: 'EVIDENCE_REDACT_CONFIG_REQUIRED',
      retryable: false,
    } satisfies Partial<StepFailure>);
    expect(await store.read('무한-스크롤', run.id)).toEqual({
      ok: false,
      code: 'EVIDENCE_BUNDLE_MISSING',
    });
  });

  test('readOnly가 아니면 필터 없이 진행(filtered=false), 연결이 없으면 빈 번들, 상한 maxLinked, discard는 파일을 지운다', async () => {
    const { topic, run } = await seed(false);
    const r = await createEvidenceStepRunner(deps(null, { ...EVIDENCE_LIMITS, maxLinked: 1 })).run(
      ctxFor(run, topic),
    );
    const pointers = JSON.parse(r.artifacts[EVIDENCE_ARTIFACT]!) as EvidencePointers;
    expect(pointers.items).toHaveLength(1);
    expect(pointers.filtered).toBe(false);
    const stored = await store.read('무한-스크롤', run.id);
    expect(stored.ok && stored.bundle.items[0]!.snippet).toContain('Example Corp');

    const runner = createEvidenceStepRunner(deps(null));
    await runner.discard!({
      runId: run.id,
      step: 'evidence',
      topic: { id: topic.id, title: 't', slug: '무한-스크롤' },
    });
    expect(await store.read('무한-스크롤', run.id)).toEqual({
      ok: false,
      code: 'EVIDENCE_BUNDLE_MISSING',
    });

    await prisma.topicAnalysisLink.deleteMany();
    const empty = await runner.run(ctxFor(run, topic));
    expect(JSON.parse(empty.artifacts[EVIDENCE_ARTIFACT]!)).toMatchObject({
      items: [],
      unreadable: 0,
    });
  });

  test('리포 경로를 읽을 수 없으면 EVIDENCE_REPO_UNAVAILABLE(재시도 불가), 저장 실패는 EVIDENCE_STORE_WRITE_FAILED(경로 없는 문구)', async () => {
    const { repo, topic, run } = await seed(false);
    await prisma.repo.update({ where: { id: repo.id }, data: { path: join(dir, 'moved-away') } });
    await expect(
      createEvidenceStepRunner(deps(null)).run(ctxFor(run, topic)),
    ).rejects.toMatchObject({
      name: 'StepFailure',
      code: 'EVIDENCE_REPO_UNAVAILABLE',
      retryable: false,
    });
    await prisma.repo.update({ where: { id: repo.id }, data: { path: repoPath } });

    const failingStore = {
      write: async () => {
        throw new Error(`EACCES: permission denied, open '${join(dir, 'data')}'`);
      },
      read: store.read.bind(store),
      remove: store.remove.bind(store),
    };
    const err = await createEvidenceStepRunner({ ...deps(null), store: failingStore })
      .run(ctxFor(run, topic))
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      name: 'StepFailure',
      code: 'EVIDENCE_STORE_WRITE_FAILED',
      retryable: false,
    });
    expect((err as Error).message).not.toContain(dir);
    expect((err as Error).cause).toBeInstanceOf(Error);
  });

  test('상한은 담긴 항목 기준 — 중복·못 읽는 포인터가 예산을 먹지 않는다', async () => {
    const { change, topic, run } = await seed(false);
    // 계획 순서: change(b.ts, a.ts 1~2) → area(a.ts 1~2 중복, gone.ts 없음). maxLinked 2면 change 둘이 담긴다.
    const r = await createEvidenceStepRunner(deps(null, { ...EVIDENCE_LIMITS, maxLinked: 2 })).run(
      ctxFor(run, topic),
    );
    const pointers = JSON.parse(r.artifacts[EVIDENCE_ARTIFACT]!) as EvidencePointers;
    expect(pointers.items.map((i) => [i.analysisId, i.path])).toEqual([
      [change.id, 'src/b.ts'],
      [change.id, 'src/a.ts'],
    ]);
  });

  test('종료 신호가 오면 AbortError로 끊고 번들을 쓰지 않는다, 다른 단계명은 프로그래머 오류', async () => {
    const { topic, run } = await seed(false);
    const controller = new AbortController();
    controller.abort();
    await expect(
      createEvidenceStepRunner(deps(null)).run(ctxFor(run, topic, controller.signal)),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(await store.read('무한-스크롤', run.id)).toEqual({
      ok: false,
      code: 'EVIDENCE_BUNDLE_MISSING',
    });
    await expect(
      createEvidenceStepRunner(deps(null)).run({ ...ctxFor(run, topic), step: 'velog' }),
    ).rejects.toThrow('라우팅');
  });
});
