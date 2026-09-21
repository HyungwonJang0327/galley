// 읽기 전용 git 접근 — 리포 경로에서 `git rev-parse`·`ls-tree`·`show`만 실행한다. 파일·브랜치·git 상태를 바꾸는 명령은
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
      /does not exist in|exists on disk, but not in|bad revision|unknown revision|invalid object name|Not a valid object name|path .* does not exist|is outside repository/i.test(
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

/** 커밋 시점의 파일 본문. `git show <commit>:<path>` — 포인터가 commit 기준이라 HEAD가 바뀌어도 같은 조각. */
export async function gitShowFile(
  repoPath: string,
  commit: string,
  path: string,
): Promise<GitResult<string>> {
  if (!isCommitRef(commit)) return { ok: false, code: 'GIT_OBJECT_NOT_FOUND' };
  return git(repoPath, ['show', '--end-of-options', `${commit}:${path}`]);
}

/** 본문에 NUL이 있으면 바이너리 — 모델에 보내지 않는다(확장자 목록에 없는 바이너리 방어). */
export const looksBinary = (text: string): boolean => text.includes('\0');
