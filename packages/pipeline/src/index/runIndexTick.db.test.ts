// 통합: 픽스처 git 리포 + 임시 SQLite + 스크립트 어댑터 + 손으로 돌리는 clock/timers. 회사 리포는 열지 않는다.
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import {
  INDEX_HEARTBEAT_TIMEOUT_MS,
  parseCursor,
  runIndexTick,
  type IndexTickDeps,
  type IndexTickOutcome,
} from './runIndexTick.ts';
import { createScriptedAdapter, type ScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import { INDEX_JOB_STATUS, REPO_STATUS } from './schema.ts';
import type { Timers } from '../worker/WorkerDeps.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
let dir: string;
let repoPath: string;
let prisma: PrismaClient;
const shas: string[] = [];

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t.test',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t.test',
};
const g = (env: Record<string, string>, ...args: string[]) =>
  execFileSync('git', args, {
    cwd: repoPath,
    env: { ...GIT_ENV, ...env },
    encoding: 'utf8',
  }).trim();
const commit = (date: string, message: string) => {
  g(
    { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    message,
  );
  shas.push(g({}, 'rev-parse', 'HEAD'));
};

const answer = (prompt: string): string => {
  if (prompt.includes('## 영역별 분석 글')) {
    const keys = [...prompt.matchAll(/### (\S+) — /g)].map((m) => m[1]!);
    return JSON.stringify({
      title: '개요',
      summary: '개요 요약.',
      keywords: ['fixture'],
      sources: keys.slice(0, 2),
    });
  }
  if (prompt.includes('## 커밋')) {
    const period = /기간: (\S+)/.exec(prompt)![1]!;
    const m = /### ([0-9a-f]{7}) .*\n(?:.*\n)*?파일: ([ADMT]) (\S+)/.exec(prompt);
    return JSON.stringify({
      title: `${period} 변경`,
      summary: `${period} 요약.`,
      keywords: [period],
      pointers: m ? [{ commit: m[1], path: m[3] }] : [],
    });
  }
  const dirName = /디렉터리: (.+)/.exec(prompt)![1]!;
  const file = /### (\S+)/.exec(prompt)?.[1];
  return JSON.stringify({
    title: `${dirName} 영역`,
    summary: `${dirName} 요약.`,
    keywords: [dirName],
    pointers: file ? [{ path: file, lineStart: 1, lineEnd: 1 }] : [],
  });
};

function fakeDeps(adapter: ScriptedAdapter, overrides: Partial<IndexTickDeps> = {}) {
  let t = Date.UTC(2026, 8, 22, 0, 0, 0);
  const everies: { fn: () => void; stopped: boolean }[] = [];
  const timers: Timers = {
    every(_ms, fn) {
      const e = { fn, stopped: false };
      everies.push(e);
      return () => {
        e.stopped = true;
      };
    },
    after: () => () => {},
  };
  const logs: string[] = [];
  const deps: IndexTickDeps = {
    prisma,
    workerId: 'w1',
    clock: { now: () => new Date(t) },
    timers,
    logger: {
      info: (m) => void logs.push(`info:${m}`),
      error: (m) => void logs.push(`error:${m}`),
    },
    adapters: { get: (id) => (id === adapter.id ? adapter : undefined) },
    redactConfig: null,
    ...overrides,
  };
  return {
    deps,
    logs,
    everies,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

async function makeRepo(readOnly = false) {
  return prisma.repo.create({ data: { name: 'fixture', path: repoPath, readOnly } });
}
async function enqueue(
  repoId: string,
  data: { kind?: string; fromSha?: string; modelId?: string } = {},
) {
  return prisma.indexJob.create({
    data: {
      repoId,
      kind: data.kind ?? 'full',
      fromSha: data.fromSha ?? null,
      modelId: data.modelId ?? 'mock:scripted',
    },
  });
}
/** idle이 나올 때까지 돌리고 outcome 목록을 준다. */
async function drain(deps: IndexTickDeps, max = 30): Promise<IndexTickOutcome[]> {
  const outcomes: IndexTickOutcome[] = [];
  for (let i = 0; i < max; i += 1) {
    const r = await runIndexTick(deps);
    outcomes.push(r.outcome);
    if (r.outcome === 'idle' || r.outcome === 'failed') break;
  }
  return outcomes;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-index-tick-'));
  repoPath = join(dir, 'repo');
  await mkdir(join(repoPath, 'src'), { recursive: true });
  await mkdir(join(repoPath, 'docs'), { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repoPath, env: GIT_ENV });
  await writeFile(join(repoPath, 'README.md'), '# fixture\n');
  await writeFile(join(repoPath, 'src', 'a.ts'), 'export const a = 1;\n');
  g({}, 'add', '.');
  commit('2024-03-05T10:00:00+09:00', 'init');
  await writeFile(join(repoPath, 'docs', 'g.md'), 'guide\n');
  g({}, 'add', '.');
  commit('2024-04-01T10:00:00+09:00', 'docs: guide');

  const url = `file:${join(dir, 'test.db')}`;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'ignore',
  });
  prisma = new PrismaClient({ datasources: { db: { url } } });
});

beforeEach(async () => {
  await prisma.indexJob.deleteMany();
  await prisma.topicAnalysisLink.deleteMany();
  await prisma.repoAnalysis.deleteMany();
  await prisma.repo.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

describe('parseCursor', () => {
  test('null·모르는 값은 areas 처음, "<단계>:<키>"는 그 단계의 키 다음', () => {
    expect(parseCursor(null)).toEqual({ phase: 'areas' });
    expect(parseCursor('zzz')).toEqual({ phase: 'areas' });
    expect(parseCursor('areas:')).toEqual({ phase: 'areas' });
    expect(parseCursor('changes:change:2024-03')).toEqual({
      phase: 'changes',
      afterKey: 'change:2024-03',
    });
    expect(parseCursor('overview:')).toEqual({ phase: 'overview' });
  });
});

describe('runIndexTick', () => {
  test('전체 인덱싱: 잡기 → 영역 3 → 변경 2 → 개요 → 완료. 진행·사용량·Repo ready·headSha가 기록된다', async () => {
    const repo = await makeRepo();
    const job = await enqueue(repo.id);
    const adapter = createScriptedAdapter((i) => answer(i.prompt));
    const { deps, everies } = fakeDeps(adapter);

    const outcomes = await drain(deps);
    expect(outcomes).toEqual([
      'claimed',
      'progressed', // area:.
      'progressed', // area:docs
      'progressed', // area:src → 영역 끝, 다음 단계
      'progressed', // change:2024-03
      'progressed', // change:2024-04 → 변경 끝
      'completed', // overview
      'idle',
    ]);
    expect(adapter.calls).toHaveLength(6);
    expect(everies.every((e) => e.stopped)).toBe(true); // heartbeat 타이머는 틱마다 정리

    const done = await prisma.indexJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({
      status: INDEX_JOB_STATUS.done,
      workerId: null,
      progressDone: 6,
      progressTotal: 6,
      progressCursor: 'overview:',
      toSha: shas[1],
      errorCode: null,
    });
    expect(done.inputTokens).toBeGreaterThan(0);
    expect(done.costUsd).toBeCloseTo(0.006);
    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();

    const updated = await prisma.repo.findUniqueOrThrow({ where: { id: repo.id } });
    expect(updated).toMatchObject({
      status: REPO_STATUS.ready,
      headSha: shas[1],
      lastIndexModelId: 'mock:scripted',
    });
    expect(updated.lastIndexedAt).not.toBeNull();
    const keys = (
      await prisma.repoAnalysis.findMany({ where: { repoId: repo.id }, orderBy: { key: 'asc' } })
    ).map((r) => r.key);
    expect(keys).toEqual([
      'area:.',
      'area:docs',
      'area:src',
      'change:2024-03',
      'change:2024-04',
      'overview',
    ]);
  });

  test('증분: 새 커밋이 닿은 영역·달만 다시 만들고, 사라진 영역은 지우며, 나머지 글의 id는 유지된다', async () => {
    const repo = await makeRepo();
    await enqueue(repo.id);
    const full = createScriptedAdapter((i) => answer(i.prompt));
    await drain(fakeDeps(full).deps);
    const before = new Map(
      (await prisma.repoAnalysis.findMany({ where: { repoId: repo.id } })).map(
        (r) => [r.key, r.id] as const,
      ),
    );

    // docs를 통째로 지우고 src에 파일을 더한다(2024-05)
    g({}, 'rm', '-q', '-r', 'docs');
    await writeFile(join(repoPath, 'src', 'b.ts'), 'export const b = 2;\n');
    g({}, 'add', '.');
    commit('2024-05-02T10:00:00+09:00', 'feat: b, drop docs');
    try {
      await enqueue(repo.id, { kind: 'incremental', fromSha: shas[1] });
      const inc = createScriptedAdapter((i) => answer(i.prompt));
      const outcomes = await drain(fakeDeps(inc).deps);
      expect(outcomes).toEqual([
        'claimed',
        'progressed', // area:src (area:.는 unchanged, docs는 계획에 없음 → 단계 끝 + prune)
        'progressed', // change:2024-05
        'completed',
        'idle',
      ]);
      expect(
        inc.calls.map(
          (c) => /디렉터리: (.+)|기간: (\S+)/.exec(c.prompt)?.slice(1).find(Boolean) ?? 'overview',
        ),
      ).toEqual(['src', '2024-05', 'overview']);
      const after = new Map(
        (await prisma.repoAnalysis.findMany({ where: { repoId: repo.id } })).map(
          (r) => [r.key, r.id] as const,
        ),
      );
      expect([...after.keys()].sort()).toEqual([
        'area:.',
        'area:src',
        'change:2024-03',
        'change:2024-04',
        'change:2024-05',
        'overview',
      ]);
      for (const key of ['area:.', 'area:src', 'change:2024-03', 'change:2024-04', 'overview'])
        expect(after.get(key), key).toBe(before.get(key));
      expect((await prisma.repo.findUniqueOrThrow({ where: { id: repo.id } })).headSha).toBe(
        shas[2],
      );
    } finally {
      // 다음 테스트를 위해 픽스처를 되돌린다(테스트 리포에만 쓴다)
      g({}, 'reset', '-q', '--hard', shas[1]!);
      shas.pop();
    }
  });

  test('중단·재개: interrupted 작업은 커서 다음부터 이어 돌고 이미 끝난 배치는 모델을 다시 부르지 않는다', async () => {
    const repo = await makeRepo();
    const job = await enqueue(repo.id);
    const adapter = createScriptedAdapter((i) => answer(i.prompt));
    const { deps } = fakeDeps(adapter);
    await runIndexTick(deps); // claimed
    await runIndexTick(deps); // area:.
    await runIndexTick(deps); // area:docs
    // 워커가 죽었다 치고 다른 워커가 회수한 상태로 만든다
    await prisma.indexJob.update({
      where: { id: job.id },
      data: { status: INDEX_JOB_STATUS.interrupted, workerId: null },
    });
    const callsBefore = adapter.calls.length;
    const { deps: other } = fakeDeps(adapter, { workerId: 'w2' });
    const outcomes = await drain(other);
    expect(outcomes).toEqual([
      'claimed',
      'progressed',
      'progressed',
      'progressed',
      'completed',
      'idle',
    ]);
    expect(adapter.calls.length - callsBefore).toBe(4); // area:src + change×2 + overview
    const done = await prisma.indexJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({
      status: INDEX_JOB_STATUS.done,
      progressDone: 6,
      progressTotal: 6,
    });
  });

  test('heartbeat 공백은 회수(recovered)하고, 종료 신호는 배치 뒤에 반환(released)한다', async () => {
    const repo = await makeRepo();
    const job = await enqueue(repo.id);
    const adapter = createScriptedAdapter((i) => answer(i.prompt));
    const { deps, advance } = fakeDeps(adapter);
    await runIndexTick(deps); // claimed, heartbeat=now
    advance(INDEX_HEARTBEAT_TIMEOUT_MS + 1);
    expect((await runIndexTick(deps)).outcome).toBe('recovered');
    expect((await prisma.indexJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe(
      INDEX_JOB_STATUS.interrupted,
    );

    const controller = new AbortController();
    expect((await runIndexTick(deps, controller.signal)).outcome).toBe('claimed');
    controller.abort();
    expect((await runIndexTick(deps, controller.signal)).outcome).toBe('idle'); // 이미 종료 중이면 새로 돌지 않는다
    const c2 = new AbortController();
    const abortDuring = createScriptedAdapter((i) => {
      c2.abort();
      return answer(i.prompt);
    });
    const { deps: d2 } = fakeDeps(abortDuring);
    const r = await runIndexTick(d2, c2.signal);
    expect(r.outcome).toBe('released');
    const released = await prisma.indexJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(released).toMatchObject({
      status: INDEX_JOB_STATUS.interrupted,
      workerId: null,
      progressDone: 1,
    });
    expect(released.progressCursor).toBe('areas:area:.');
    expect((await prisma.repo.findUniqueOrThrow({ where: { id: repo.id } })).status).toBe(
      REPO_STATUS.indexing,
    );
  });

  test('모델 호출 실패는 작업 failed + Repo error, 모르는 모델 id도 failed, readOnly + 필터 없음은 REDACT_CONFIG_REQUIRED', async () => {
    const repo = await makeRepo();
    const job = await enqueue(repo.id);
    const broken = createScriptedAdapter(() => {
      throw new Error('401');
    });
    const { deps, logs } = fakeDeps(broken);
    expect(await drain(deps)).toEqual(['claimed', 'failed']);
    expect(await prisma.indexJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: INDEX_JOB_STATUS.failed,
      errorCode: 'MODEL_FAILED',
      errorMessage: 'Error',
      workerId: null,
    });
    expect((await prisma.repo.findUniqueOrThrow({ where: { id: repo.id } })).status).toBe(
      REPO_STATUS.error,
    );
    expect(logs).toContain('error:인덱싱 작업 실패');

    const unknown = await enqueue(repo.id, { modelId: 'nope' });
    await drain(deps);
    expect((await prisma.indexJob.findUniqueOrThrow({ where: { id: unknown.id } })).errorCode).toBe(
      'INDEX_MODEL_UNKNOWN',
    );

    const ro = await prisma.repo.create({
      data: { name: 'ro', path: repoPath + '-ro', readOnly: true },
    });
    const roJob = await enqueue(ro.id);
    await drain(fakeDeps(createScriptedAdapter((i) => answer(i.prompt))).deps);
    expect((await prisma.indexJob.findUniqueOrThrow({ where: { id: roJob.id } })).errorCode).toBe(
      'REDACT_CONFIG_REQUIRED',
    );
  });

  test('예상 밖 예외는 INDEX_UNEXPECTED로 실패 처리하고 스택은 로그에만 남긴다', async () => {
    const repo = await makeRepo();
    const job = await enqueue(repo.id);
    const adapter = createScriptedAdapter((i) => answer(i.prompt));
    const { deps, logs } = fakeDeps(adapter, {
      adapters: {
        get: () => {
          throw new TypeError('boom');
        },
      },
    });
    expect(await drain(deps)).toEqual(['claimed', 'failed']);
    const failed = await prisma.indexJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed).toMatchObject({ errorCode: 'INDEX_UNEXPECTED', errorMessage: 'TypeError' });
    expect(logs).toContain('error:인덱싱 틱 실패');
  });
});
