import { describe, test, expect } from 'vitest';
import {
  planChangeBatches,
  periodOf,
  pointerCandidates,
  primaryDir,
  stripTrailers,
} from './changes.ts';
import type { GitCommit } from './gitRead.ts';
import { INDEX_LIMITS } from './limits.ts';

const commit = (
  n: number,
  authoredAt: string,
  paths: string[],
  extra: Partial<GitCommit> = {},
): GitCommit => ({
  sha: n.toString(16).padStart(40, '0'),
  parentSha: (n - 1).toString(16).padStart(40, '0'),
  authoredAt,
  subject: `commit ${n}`,
  body: '',
  files: paths.map((path) => ({ status: 'M' as const, path })),
  ...extra,
});

describe('periodOf · primaryDir · pointerCandidates', () => {
  test('작성일의 연-월, 깨진 값은 unknown', () => {
    expect(periodOf('2024-03-20T10:00:00+09:00')).toBe('2024-03');
    expect(periodOf('')).toBe('unknown');
  });

  test('가장 많이 손댄 최상위 디렉터리, 동률은 코드포인트 앞, 루트는 .', () => {
    expect(
      primaryDir([
        { status: 'M', path: 'src/a.ts' },
        { status: 'M', path: 'src/b.ts' },
        { status: 'M', path: 'docs/g.md' },
      ]),
    ).toBe('src');
    expect(
      primaryDir([
        { status: 'M', path: 'src/a.ts' },
        { status: 'M', path: 'docs/g.md' },
      ]),
    ).toBe('docs');
    expect(primaryDir([{ status: 'M', path: 'README.md' }])).toBe('.');
  });

  test('삭제 파일은 부모 커밋 기준, 부모가 없으면 뺀다', () => {
    const c = commit(2, '2024-03-01T00:00:00+09:00', []);
    c.files = [
      { status: 'A', path: 'src/b.ts' },
      { status: 'D', path: 'src/a.ts' },
    ];
    expect(pointerCandidates(c)).toEqual([
      { commit: c.sha, path: 'src/b.ts' },
      { commit: c.parentSha, path: 'src/a.ts' },
    ]);
    expect(pointerCandidates({ sha: c.sha, files: c.files })).toEqual([
      { commit: c.sha, path: 'src/b.ts' },
    ]);
  });
});

describe('planChangeBatches', () => {
  test('월별로 묶고 오래된 순으로 정렬한다(입력은 최신 순)', () => {
    const plan = planChangeBatches([
      commit(3, '2024-04-01T10:00:00+09:00', ['src/c.ts']),
      commit(2, '2024-03-20T10:00:00+09:00', ['docs/g.md']),
      commit(1, '2024-03-05T10:00:00+09:00', ['src/a.ts']),
    ]);
    expect(plan.totalCommits).toBe(3);
    expect(plan.emptyCommits).toBe(0);
    expect(plan.ignoredCommits).toBe(0);
    expect(plan.batches.map((b) => b.key)).toEqual(['change:2024-03', 'change:2024-04']);
    expect(plan.batches[0]).toMatchObject({ period: '2024-03', summaryOnly: false });
    expect(plan.batches[0]!.dir).toBeUndefined();
    expect(plan.batches[0]!.commits.map((c) => c.subject)).toEqual(['commit 1', 'commit 2']);
  });

  test('무시 경로만 손댄 커밋은 ignored, 파일이 없는 커밋은 empty로 따로 세며, 남은 커밋의 파일 목록에서도 뺀다', () => {
    const plan = planChangeBatches([
      commit(3, '2024-03-21T10:00:00+09:00', []),
      commit(2, '2024-03-20T10:00:00+09:00', ['pnpm-lock.yaml', 'node_modules/x/i.js']),
      commit(1, '2024-03-05T10:00:00+09:00', ['src/a.ts', '.env']),
    ]);
    expect(plan.emptyCommits).toBe(1);
    expect(plan.ignoredCommits).toBe(1);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0]!.commits[0]!.files).toEqual([{ status: 'M', path: 'src/a.ts' }]);
  });

  test('한 달이 commitsPerBatch를 넘으면 주 디렉터리로 나누고, 그래도 넘으면 앞쪽만 상세(summaryOnly)', () => {
    const limits = { ...INDEX_LIMITS, commitsPerBatch: 2 };
    const commits = [
      commit(5, '2024-03-25T00:00:00+09:00', ['src/e.ts']),
      commit(4, '2024-03-20T00:00:00+09:00', ['src/d.ts', 'src/d2.ts', 'docs/x.md']),
      commit(3, '2024-03-15T00:00:00+09:00', ['src/c.ts']),
      commit(2, '2024-03-10T00:00:00+09:00', ['docs/g.md']),
      commit(1, '2024-03-05T00:00:00+09:00', ['README.md']),
    ];
    const plan = planChangeBatches(commits, limits);
    expect(plan.batches.map((b) => b.key)).toEqual([
      'change:2024-03:.',
      'change:2024-03:docs',
      'change:2024-03:src',
    ]);
    const src = plan.batches[2]!;
    expect(src).toMatchObject({ period: '2024-03', dir: 'src', summaryOnly: true });
    expect(src.commits.map((c) => [c.subject, c.detail])).toEqual([
      ['commit 3', true],
      ['commit 4', true],
      ['commit 5', false],
    ]);
    expect(plan.batches[1]!.summaryOnly).toBe(false);
  });

  test('stripTrailers는 마지막 문단이 전부 트레일러일 때만 뗀다', () => {
    expect(
      stripTrailers(
        'desc line\n\nmore detail: with colon inside\n\nSigned-off-by: A <a@corp.example>\nCo-authored-by: B <b@corp.example>\n(cherry picked from commit 0123abcd)\n',
      ),
    ).toBe('desc line\n\nmore detail: with colon inside');
    expect(stripTrailers('Signed-off-by: A <a@corp.example>')).toBe('');
    expect(stripTrailers('desc\n\nFixes: #12 and also\nplain line')).toBe(
      'desc\n\nFixes: #12 and also\nplain line',
    );
    expect(stripTrailers('')).toBe('');
  });

  test('본문은 트레일러를 뗀 뒤 commitBodyChars로 자른다', () => {
    const limits = { ...INDEX_LIMITS, commitBodyChars: 5 };
    const plan = planChangeBatches(
      [
        commit(1, '2024-03-05T00:00:00+09:00', ['src/a.ts'], {
          body: 'abcdefghij\n\nSigned-off-by: A <a@corp.example>',
        }),
      ],
      limits,
    );
    expect(plan.batches[0]!.commits[0]!.body).toBe('abcde');
  });

  test('빈 입력은 빈 계획', () => {
    expect(planChangeBatches([])).toEqual({
      totalCommits: 0,
      emptyCommits: 0,
      ignoredCommits: 0,
      batches: [],
    });
  });
});
