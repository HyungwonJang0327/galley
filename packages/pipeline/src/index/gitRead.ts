// 읽기 전용 git 접근 — 리포 경로에서 `git rev-parse`·`ls-tree`·`cat-file blob`·`log`·`rev-list`·`diff --name-only`만 실행한다. 파일·브랜치·git 상태를 바꾸는 명령은
// 여기 없고 앞으로도 두지 않는다(CLAUDE.md §5 "읽기 전용 리포에 쓰기 금지"). 예상된 실패는 값으로.
// 옵션 주입 방어: 커밋 인자는 형식 검증 + 모든 위치 인자 앞에 `--end-of-options`(`--output=…`같은 값이 옵션으로 읽히지 않게).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TreeFile } from './tree.ts';

const run = promisify(execFile);

export type GitFailure =
  | { ok: false; code: 'NOT_A_GIT_REPO' }
  | { ok: false; code: 'GIT_OBJECT_NOT_FOUND' }
  | { ok: false; code: 'GIT_COMMAND_FAILED' };
export type GitResult<T> = { ok: true; value: T } | GitFailure;

/** git show 등에서 큰 파일을 만나도 버퍼가 터지지 않게(INDEX_LIMITS.fileBytes보다 훨씬 크게). */
const MAX_BUFFER = 64 * 1024 * 1024;

/** 커밋 인자로 받는 것: 해시(4~40 hex) 또는 HEAD. 그 밖(브랜치명·`--옵션`)은 받지 않는다 — 포인터는 commit 해시 기준이다. */
export const isCommitRef = (value: string): boolean =>
  value === 'HEAD' || /^[0-9a-f]{4,40}$/i.test(value);

function gitEnv(): NodeJS.ProcessEnv {
  // 메시지 판별을 위해 영어 로케일 고정, 자격 증명 프롬프트 차단(읽기만 하므로 필요 없다),
  // 환경으로 다른 리포·인덱스를 가리키는 변수는 제거(cwd의 리포만 본다).
  const { GIT_DIR: _d, GIT_WORK_TREE: _w, GIT_INDEX_FILE: _i, ...rest } = process.env;
  void _d;
  void _w;
  void _i;
  return { ...rest, LC_ALL: 'C', LANG: 'C', GIT_TERMINAL_PROMPT: '0' };
}

async function git(repoPath: string, args: readonly string[]): Promise<GitResult<string>> {
  try {
    const { stdout } = await run('git', [...args], {
      cwd: repoPath,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      env: gitEnv(),
    });
    return { ok: true, value: stdout };
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
    if (/not a git repository/i.test(stderr)) return { ok: false, code: 'NOT_A_GIT_REPO' };
    if (
      /does not exist in|exists on disk, but not in|bad revision|unknown revision|invalid object name|Not a valid object name|bad object|bad file|path .* does not exist|is outside repository/i.test(
        stderr,
      )
    )
      return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
    return { ok: false, code: 'GIT_COMMAND_FAILED' };
  }
}

/** 현재 HEAD 커밋 해시. Repo.headSha·stale 판정에 쓴다. */
export async function gitHead(repoPath: string): Promise<GitResult<string>> {
  // 인자가 상수 'HEAD'라 주입 여지가 없다. rev-parse는 --end-of-options를 출력에 섞는 버전이 있어 붙이지 않는다.
  const r = await git(repoPath, ['rev-parse', 'HEAD']);
  return r.ok ? { ok: true, value: r.value.trim() } : r;
}

/**
 * 커밋 시점의 전체 파일 목록(경로·바이트). `git ls-tree -r -l -z --full-tree <commit>` — 작업 트리가 아니라 커밋을 읽고,
 * repoPath가 하위 폴더여도 리포 루트 기준 경로를 낸다(`show <commit>:<path>`와 같은 기준). 심볼릭 링크·서브모듈은 뺀다.
 */
export async function gitListFiles(
  repoPath: string,
  commit: string,
): Promise<GitResult<TreeFile[]>> {
  if (!isCommitRef(commit)) return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  const r = await git(repoPath, [
    'ls-tree',
    '-r',
    '-l',
    '-z',
    '--full-tree',
    '--end-of-options',
    commit,
  ]);
  if (!r.ok) return r;
  const files: TreeFile[] = [];
  for (const entry of r.value.split('\0')) {
    if (entry === '') continue;
    // "<mode> <type> <object> <size>\t<path>" — size는 blob만 숫자(submodule은 '-'). 120000 = 심볼릭 링크(본문이 대상 경로).
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const meta = entry.slice(0, tab).trim().split(/\s+/);
    const path = entry.slice(tab + 1);
    if (meta[1] !== 'blob' || meta[0] === '120000') continue;
    const size = Number(meta[3]);
    files.push({ path, size: Number.isFinite(size) ? size : 0 });
  }
  return { ok: true, value: files };
}

/**
 * 커밋 시점의 파일 본문. `git cat-file blob <commit>:<path>` — 포인터가 commit 기준이라 HEAD가 바뀌어도 같은 조각.
 * `show`가 아니라 `cat-file blob`인 이유: 경로가 디렉터리면 `show`는 트리 목록을 성공으로 돌려줘 "근거"가 된다(BE8 리뷰 3).
 * blob이 아니면 `bad file` → GIT_OBJECT_NOT_FOUND.
 */
export async function gitShowFile(
  repoPath: string,
  commit: string,
  path: string,
): Promise<GitResult<string>> {
  if (!isCommitRef(commit)) return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  return git(repoPath, ['cat-file', 'blob', '--end-of-options', `${commit}:${path}`]);
}

/** 커밋이 파일에 한 일 — `--raw`의 상태 문자(`--no-renames`라 R/C는 나오지 않고 A+D로 풀린다). T = 종류 변경. */
export type GitFileStatus = 'A' | 'M' | 'D' | 'T';
export interface GitCommitFile {
  status: GitFileStatus;
  path: string;
}
export interface GitCommit {
  sha: string;
  /** 첫 부모(루트 커밋은 없음). 삭제된 파일의 포인터는 이 커밋 기준으로 만든다. */
  parentSha?: string;
  /** 작성일(author date, ISO 8601). 리베이스로 바뀌는 커밋일이 아니라 작업한 날 — change 글의 period 기준. */
  authoredAt: string;
  subject: string;
  body: string;
  /** 일반 파일만(서브모듈·심볼릭 링크 제외 — gitListFiles와 같은 기준). 빈 커밋은 []. */
  files: GitCommitFile[];
}

export interface GitLogOptions {
  /** 범위 끝(포함). 해시 또는 HEAD. */
  to: string;
  /** 범위 시작(제외) — 증분 재인덱싱 `from..to`. 없으면 처음부터. */
  from?: string;
  /** 최신부터 이 개수까지만. */
  maxCommits: number;
}

export interface GitLogResult {
  /** 최신 순. */
  commits: GitCommit[];
  /** maxCommits보다 오래된 커밋이 더 있었으면 true. */
  truncated: boolean;
}

const isFileStatus = (v: string): v is GitFileStatus =>
  v === 'A' || v === 'M' || v === 'D' || v === 'T';
/** 포인터로 열 수 없는 mode — 서브모듈(gitlink)·심볼릭 링크(본문이 대상 경로). src·dst 어느 쪽이든 해당하면 뺀다. */
const EXCLUDED_MODES = new Set(['160000', '120000']);
const FULL_SHA = /^[0-9a-f]{40}$/;

/** 레코드 헤더 `<sha>\x1f<parents>\x1f<authoredAt>\x1f<subject>\x1f<body>` — body에 \x1f가 있어도 뒤를 전부 body로. */
function parseHeader(header: string): Omit<GitCommit, 'files'> | undefined {
  const parts = header.split('\x1f');
  if (parts.length < 5) return undefined;
  const [sha, parents, authoredAt, subject] = parts as [
    string,
    string,
    string,
    string,
    ...string[],
  ];
  if (!FULL_SHA.test(sha)) return undefined;
  const parentSha = parents.split(' ').find((p) => p !== '');
  return {
    sha,
    ...(parentSha !== undefined ? { parentSha } : {}),
    authoredAt,
    subject: subject.trim(),
    body: parts.slice(4).join('\x1f').trim(),
  };
}

/** `--raw -z` 항목 `:<srcmode> <dstmode> <srcsha> <dstsha> <status>\0<path>\0`의 반복. */
function parseRawFiles(rest: string): GitCommitFile[] {
  const files: GitCommitFile[] = [];
  const tokens = rest.replace(/^\n/, '').split('\0');
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const meta = tokens[i]!;
    const path = tokens[i + 1]!;
    if (!meta.startsWith(':') || path === '') continue;
    const [srcMode = '', dstMode = '', , , status = ''] = meta.slice(1).split(' ');
    if (EXCLUDED_MODES.has(srcMode) || EXCLUDED_MODES.has(dstMode)) continue;
    const code = status.charAt(0);
    if (!isFileStatus(code)) continue;
    files.push({ status: code, path });
  }
  return files;
}

/**
 * 커밋 이력(최신 순). `git rev-list`로 **권위 있는 sha 목록**을 먼저 얻고, `git log -z --raw`의 레코드를 그 목록으로 대조한다 —
 * 커밋 본문에 레코드 구분자(\x1e)가 들어 있어도 가짜 커밋이 생기지 않게(대조에 실패한 조각은 앞 레코드의 본문으로 되돌린다).
 * 병합 커밋은 빼고(변경이 부모에 있다), 이름 바꿈은 A+D로 풀어 경로가 항상 커밋에 실존하게 하며, 서브모듈·심볼릭 링크는 뺀다.
 * diff 본문은 읽지 않는다 — 포인터가 커밋·경로를 가리키면 근거 수집이 그때 `show`로 읽는다.
 * 레코드 형식(git 2.49 실측): `\x1e<헤더>\0\n(:<meta>\0<path>\0)*`, 빈 커밋은 `\x1e<헤더>\0`.
 */
export async function gitLog(
  repoPath: string,
  options: GitLogOptions,
): Promise<GitResult<GitLogResult>> {
  if (!isCommitRef(options.to)) return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  if (options.from !== undefined && !isCommitRef(options.from))
    return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  const max = Number.isFinite(options.maxCommits) ? Math.max(0, Math.floor(options.maxCommits)) : 0;
  const range = options.from === undefined ? options.to : `${options.from}..${options.to}`;

  const listed = await git(repoPath, [
    'rev-list',
    '--no-merges',
    `--max-count=${max + 1}`,
    '--end-of-options',
    range,
  ]);
  if (!listed.ok) return listed;
  const all = listed.value.split('\n').filter((l) => FULL_SHA.test(l));
  const truncated = all.length > max;
  const order = all.slice(0, max);
  if (order.length === 0) return { ok: true, value: { commits: [], truncated } };

  const r = await git(repoPath, [
    'log',
    '-z',
    '--no-merges',
    '--no-renames',
    '--date=iso-strict',
    `--max-count=${max}`,
    '--format=%x1e%H%x1f%P%x1f%aI%x1f%s%x1f%b',
    '--raw',
    '--end-of-options',
    range,
  ]);
  if (!r.ok) return r;

  // 조각 → 레코드: sha가 목록에 있는(그리고 아직 안 나온) 조각만 새 레코드, 나머지는 앞 레코드 본문의 일부.
  const expected = new Set(order);
  const records: string[] = [];
  for (const fragment of r.value.split('\x1e')) {
    if (fragment === '' && records.length === 0) continue;
    const sha = fragment.slice(0, 40);
    if (expected.has(sha) && fragment.charAt(40) === '\x1f') {
      expected.delete(sha);
      records.push(fragment);
    } else if (records.length > 0) {
      records[records.length - 1] += `\x1e${fragment}`;
    }
  }
  const bySha = new Map<string, GitCommit>();
  for (const record of records) {
    const nul = record.indexOf('\0');
    const head = parseHeader(nul === -1 ? record : record.slice(0, nul));
    if (head === undefined) continue;
    bySha.set(head.sha, { ...head, files: nul === -1 ? [] : parseRawFiles(record.slice(nul + 1)) });
  }
  const commits: GitCommit[] = [];
  for (const sha of order) {
    const c = bySha.get(sha);
    if (c !== undefined) commits.push(c);
  }
  return { ok: true, value: { commits, truncated } };
}

/**
 * 두 커밋 사이에 바뀐 경로(추가·수정·삭제 전부, 이름 바꿈은 A+D). `git diff --name-only -z --no-renames <from> <to>` —
 * 증분 재인덱싱이 다시 만들 영역을 고르는 재료. 커밋 인자 형식 검증 + `--end-of-options`.
 */
export async function gitDiffPaths(
  repoPath: string,
  from: string,
  to: string,
): Promise<GitResult<string[]>> {
  if (!isCommitRef(from) || !isCommitRef(to)) return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  const r = await git(repoPath, [
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    '--end-of-options',
    from,
    to,
  ]);
  if (!r.ok) return r;
  return { ok: true, value: r.value.split('\0').filter((p) => p !== '') };
}

export interface GitCommitMeta {
  sha: string;
  /** 작성일(ISO 8601). */
  authoredAt: string;
  subject: string;
}

/** 커밋 하나의 메타(전체 sha·작성일·제목). `git log -1 --format` — 읽기만. 근거 항목의 date에 쓴다. */
export async function gitCommitMeta(
  repoPath: string,
  commit: string,
): Promise<GitResult<GitCommitMeta>> {
  if (!isCommitRef(commit)) return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  const r = await git(repoPath, [
    'log',
    '-1',
    '--date=iso-strict',
    '--format=%H%x1f%aI%x1f%s',
    '--end-of-options',
    commit,
  ]);
  if (!r.ok) return r;
  const [sha = '', authoredAt = '', subject = ''] = r.value.trim().split('\x1f');
  if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  return { ok: true, value: { sha, authoredAt, subject: subject.trim() } };
}

/** 본문에 NUL이 있으면 바이너리 — 모델에 보내지 않는다(확장자 목록에 없는 바이너리 방어). */
export const looksBinary = (text: string): boolean => text.includes('\0');
