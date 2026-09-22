// tmpdir 픽스처 리포로만(회사 리포 미열람).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPointerSnippet } from './readSnippet.ts';
import { EVIDENCE_LIMITS } from './limits.ts';
import type { RedactConfig } from './redact.ts';

let dir: string;
let repo: string;
let head: string;
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
  execFileSync('git', args, { cwd: repo, env: GIT_ENV, encoding: 'utf8' }).trim();
const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-snippet-'));
  repo = join(dir, 'repo');
  await mkdir(join(repo, 'src'), { recursive: true });
  await writeFile(
    join(repo, 'src', 'a.ts'),
    ['line1 Example Corp', 'line2', 'line3', 'line4 한글', 'line5'].join('\n') + '\n',
  );
  await writeFile(join(repo, 'bin.dat'), Buffer.from([0x41, 0x00, 0x42]));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, env: GIT_ENV });
  g('add', '.');
  g('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init');
  head = g('rev-parse', 'HEAD');
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('readPointerSnippet', () => {
  test('라인 범위를 읽고 note·조각을 redact하며 커밋 작성일을 붙인다', async () => {
    const r = await readPointerSnippet(
      repo,
      { commit: head, path: 'src/a.ts', lineStart: 1, lineEnd: 2, note: 'Example Corp entry' },
      REDACT,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        snippet: 'line1 [COMPANY]\nline2',
        lineRange: { start: 1, end: 2 },
        date: '2024-03-05T10:00:00+09:00',
        note: '[COMPANY] entry',
        redacted: true,
        truncated: false,
      },
    });
  });

  test('라인 없는 포인터는 파일 전체(상한까지), 끝이 넘으면 clamp, 시작이 넘으면 1부터, 필터 없으면 그대로', async () => {
    const whole = await readPointerSnippet(repo, { commit: head, path: 'src/a.ts' }, null);
    expect(whole.ok && whole.value).toMatchObject({
      lineRange: { start: 1, end: 5 },
      redacted: false,
      truncated: false,
    });
    expect(whole.ok && whole.value.snippet).toContain('Example Corp');
    const over = await readPointerSnippet(
      repo,
      { commit: head, path: 'src/a.ts', lineStart: 4, lineEnd: 99 },
      null,
    );
    expect(over.ok && over.value).toMatchObject({
      snippet: 'line4 한글\nline5',
      lineRange: { start: 4, end: 5 },
    });
    const past = await readPointerSnippet(
      repo,
      { commit: head, path: 'src/a.ts', lineStart: 50, lineEnd: 60 },
      null,
    );
    expect(past.ok && past.value.lineRange).toEqual({ start: 1, end: 5 });
  });

  test('줄·바이트 상한으로 자르면 truncated', async () => {
    const lines = await readPointerSnippet(repo, { commit: head, path: 'src/a.ts' }, null, {
      ...EVIDENCE_LIMITS,
      snippetLines: 2,
    });
    expect(lines.ok && lines.value).toMatchObject({
      snippet: 'line1 Example Corp\nline2',
      lineRange: { start: 1, end: 2 },
      truncated: true,
    });
    const bytes = await readPointerSnippet(
      repo,
      { commit: head, path: 'src/a.ts', lineStart: 4, lineEnd: 4 },
      null,
      {
        ...EVIDENCE_LIMITS,
        snippetBytes: 9,
      },
    );
    // 'line4 ' 6바이트 + '한' 3바이트 = 9, 다음 '글'은 안 들어간다(문자 경계 유지)
    expect(bytes.ok && bytes.value).toMatchObject({ snippet: 'line4 한', truncated: true });
  });

  test('없는 커밋·경로는 GIT_OBJECT_NOT_FOUND, 바이너리는 SNIPPET_BINARY', async () => {
    expect(
      await readPointerSnippet(repo, { commit: 'deadbeefdeadbeef', path: 'src/a.ts' }, null),
    ).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
    expect(await readPointerSnippet(repo, { commit: head, path: 'src/none.ts' }, null)).toEqual({
      ok: false,
      code: 'GIT_OBJECT_NOT_FOUND',
    });
    expect(await readPointerSnippet(repo, { commit: head, path: 'bin.dat' }, null)).toEqual({
      ok: false,
      code: 'SNIPPET_BINARY',
    });
  });
});
