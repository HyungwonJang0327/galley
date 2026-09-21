// 파일 트리 요약(순수) — 리포의 파일 목록을 "영역(area)"으로 나누고 모델에 넘길 파일을 상한 안에서 고른다.
// git·DB·모델을 모른다. 입력은 (경로, 크기) 목록, 출력은 영역별 계획. 결정: decisions/evidence-collection.md "리포 인덱싱".
import { INDEX_IGNORE, INDEX_LIMITS } from './limits.ts';
import type { IndexLimits } from './limits.ts';

export interface TreeFile {
  path: string;
  /** 바이트. */
  size: number;
}

export interface AreaFile extends TreeFile {
  /** 본문을 모델에 넘기는가(상한 안). false면 이름만. */
  include: boolean;
}

export interface AreaPlan {
  /** RepoAnalysis.key — `area:<디렉터리>`(루트 파일 묶음은 `area:.`). 형식은 인덱서가 소유. */
  key: string;
  dir: string;
  files: AreaFile[];
  /** 상한 초과로 일부(또는 전부) 파일을 이름만 넘겼으면 true → RepoAnalysis.summaryOnly. */
  summaryOnly: boolean;
  /** 넘기는 본문 합계 바이트. */
  includedBytes: number;
}

export interface TreeSummary {
  totalFiles: number;
  /** 인덱스 대상에서 뺀 파일 수(INDEX_IGNORE). */
  ignoredFiles: number;
  areas: AreaPlan[];
}

/** 로케일에 안 기대는 결정론적 문자열 비교(코드포인트). CI와 로컬이 같은 순서를 낸다. */
export const compareCodepoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const lower = (s: string) => s.toLowerCase();
const extOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? lower(name.slice(dot)) : '';
};

/** INDEX_IGNORE 규칙 — 디렉터리 조각·파일명·접두·확장자 중 하나라도 맞으면 뺀다. */
export function isIgnoredPath(path: string): boolean {
  const segments = path.split('/');
  const name = segments.at(-1) ?? path;
  const dirs = segments.slice(0, -1);
  if (dirs.some((seg) => (INDEX_IGNORE.dirs as readonly string[]).includes(seg))) return true;
  if ((INDEX_IGNORE.files as readonly string[]).includes(name)) return true;
  if (
    (INDEX_IGNORE.filePrefixes as readonly string[]).some(
      (p) => name === p || name.startsWith(`${p}.`),
    )
  )
    return true;
  if ((INDEX_IGNORE.extensions as readonly string[]).includes(extOf(name))) return true;
  return false;
}

/** 소스처럼 보이는 확장자 순으로 앞에 — 같은 상한 안에서 코드가 문서·설정보다 먼저 들어간다. */
const SOURCE_EXT_PRIORITY = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.rb',
  '.php',
  '.cs',
  '.vue',
  '.svelte',
  '.css',
  '.scss',
  '.sql',
  '.prisma',
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
];
function extRank(path: string): number {
  const i = SOURCE_EXT_PRIORITY.indexOf(extOf(path.split('/').at(-1) ?? path));
  return i === -1 ? SOURCE_EXT_PRIORITY.length : i;
}

interface Indexed extends TreeFile {
  segments: string[];
  rank: number;
}

/**
 * 파일을 영역으로 나눈다. 영역 = 최상위 디렉터리. 최상위 디렉터리에 파일이 `filesPerArea`보다 많고
 * 하위 디렉터리가 있으면 그 한 단계 아래로 쪼갠다(재귀) — 모노레포 `packages/*`·`src/*`가 각자 영역이 되게.
 * 루트에 바로 있는 파일들은 `.` 영역. 결정론적: 같은 입력이면 같은 계획(코드포인트 정렬).
 */
export function planAreas(
  files: readonly TreeFile[],
  limits: IndexLimits = INDEX_LIMITS,
): TreeSummary {
  const kept: Indexed[] = files
    .filter((f) => !isIgnoredPath(f.path))
    .map((f) => ({ ...f, segments: f.path.split('/'), rank: extRank(f.path) }));
  const groups = new Map<string, Indexed[]>();
  const put = (dir: string, f: Indexed) => {
    const list = groups.get(dir) ?? [];
    list.push(f);
    groups.set(dir, list);
  };
  const split = (dir: string, list: Indexed[], depth: number) => {
    const deeper = list.filter((f) => f.segments.length > depth + 1);
    if (list.length <= limits.filesPerArea || deeper.length === 0) {
      for (const f of list) put(dir, f);
      return;
    }
    for (const f of list) if (f.segments.length === depth + 1) put(dir, f);
    const byChild = new Map<string, Indexed[]>();
    for (const f of deeper) {
      const child = f.segments.slice(0, depth + 1).join('/');
      const l = byChild.get(child) ?? [];
      l.push(f);
      byChild.set(child, l);
    }
    for (const [child, l] of byChild) split(child, l, depth + 1);
  };
  const top = new Map<string, Indexed[]>();
  for (const f of kept) {
    const dir = f.segments.length === 1 ? '.' : f.segments[0]!;
    const l = top.get(dir) ?? [];
    l.push(f);
    top.set(dir, l);
  }
  for (const [dir, list] of top) {
    if (dir === '.') for (const f of list) put('.', f);
    else split(dir, list, 1);
  }

  const areas: AreaPlan[] = [];
  for (const [dir, list] of groups) {
    if (list.length === 0) continue;
    const ordered = [...list].sort(
      (a, b) => a.rank - b.rank || a.size - b.size || compareCodepoint(a.path, b.path),
    );
    let includedBytes = 0;
    let includedCount = 0;
    const planned: AreaFile[] = ordered.map((f) => {
      const fits =
        f.size <= limits.fileBytes &&
        includedCount < limits.filesPerArea &&
        includedBytes + f.size <= limits.bytesPerArea;
      if (fits) {
        includedBytes += f.size;
        includedCount += 1;
      }
      return { path: f.path, size: f.size, include: fits };
    });
    planned.sort((a, b) => compareCodepoint(a.path, b.path));
    areas.push({
      key: `area:${dir}`,
      dir,
      files: planned,
      summaryOnly: planned.some((f) => !f.include),
      includedBytes,
    });
  }
  areas.sort((a, b) => compareCodepoint(a.dir, b.dir));
  return { totalFiles: files.length, ignoredFiles: files.length - kept.length, areas };
}

/**
 * 사람이 보는 트리 요약(CLI 화면용). **디렉터리 이름이 들어가므로 DB·로그에 저장하지 않는다** —
 * IndexJob·report에는 수치만 남긴다(decisions/evidence-collection.md 2026-09-22).
 */
export function describeTree(summary: TreeSummary): string {
  const lines = summary.areas.map(
    (a) =>
      `- ${a.dir} (${a.files.length} files, ${a.files.filter((f) => f.include).length} with content)`,
  );
  return [`${summary.totalFiles} files (${summary.ignoredFiles} ignored)`, ...lines].join('\n');
}
