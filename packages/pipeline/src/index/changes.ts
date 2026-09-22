// 커밋 이력 계획(순수) — git log 결과를 "변경 묶음(change batch)"으로 나눈다. git·DB·모델을 모른다.
// 묶음 = 작성 월(`YYYY-MM`). 한 달의 커밋이 `commitsPerBatch`를 넘으면 커밋의 주 디렉터리(가장 많이 손댄 최상위 디렉터리)로
// 다시 나눈다(`change:<YYYY-MM>:<dir>`). 그래도 넘으면 앞쪽 커밋만 상세(본문·파일)로 넘기고 나머지는 제목만 → summaryOnly.
// 결정: decisions/evidence-collection.md "리포 인덱싱" (BE4).
import type { GitCommit, GitCommitFile } from './gitRead.ts';
import { INDEX_LIMITS, type IndexLimits } from './limits.ts';
import type { EvidencePointer } from './schema.ts';
import { compareCodepoint, isIgnoredPath } from './tree.ts';

export interface ChangeCommit {
  sha: string;
  parentSha?: string;
  authoredAt: string;
  subject: string;
  /** `commitBodyChars`로 자른 본문. */
  body: string;
  /** INDEX_IGNORE를 뺀 변경 파일(전부 — 포인터 후보). 프롬프트는 `filesPerCommit`까지만 나열한다. */
  files: GitCommitFile[];
  /** false면 제목만 넘긴다(상한 초과). */
  detail: boolean;
}

export interface ChangeBatch {
  /** RepoAnalysis.key — `change:<YYYY-MM>` 또는 `change:<YYYY-MM>:<dir>`. 형식은 인덱서가 소유. */
  key: string;
  /** RepoAnalysis.period. */
  period: string;
  /** 월 안에서 디렉터리로 나눴을 때만. 루트 파일 묶음은 `.`. */
  dir?: string;
  /** 오래된 순. */
  commits: ChangeCommit[];
  /** 제목만 넘긴 커밋이 있으면 true → RepoAnalysis.summaryOnly. */
  summaryOnly: boolean;
}

export interface ChangePlan {
  /** 입력 커밋 수(병합 제외, maxCommits 안). */
  totalCommits: number;
  /** 변경 파일이 없는 커밋 수(`--allow-empty` 등). 묶음에 넣지 않는다. */
  emptyCommits: number;
  /** 변경 파일이 있었지만 전부 INDEX_IGNORE라 뺀 커밋 수. */
  ignoredCommits: number;
  batches: ChangeBatch[];
}

/** 작성일(ISO 8601, 작성자 로컬 오프셋)의 연-월. 형식이 깨졌으면 `unknown`(그래도 묶는다). */
export const periodOf = (authoredAt: string): string =>
  /^\d{4}-\d{2}/.test(authoredAt) ? authoredAt.slice(0, 7) : 'unknown';

/** 커밋이 가장 많이 손댄 최상위 디렉터리(동률은 코드포인트 앞). 루트 파일은 `.`. */
export function primaryDir(files: readonly GitCommitFile[]): string {
  const counts = new Map<string, number>();
  for (const f of files) {
    const slash = f.path.indexOf('/');
    const top = slash === -1 ? '.' : f.path.slice(0, slash);
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  let best = '.';
  let bestCount = -1;
  for (const [dir, count] of [...counts.entries()].sort((a, b) => compareCodepoint(a[0], b[0]))) {
    if (count > bestCount) {
      best = dir;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 커밋의 포인터 후보 — 추가·수정·종류 변경 파일은 그 커밋 기준, 삭제 파일은 첫 부모 커밋 기준(삭제 후에는 열 수 없다).
 * 여기서 나온 포인터는 전부 `git show <commit>:<path>`로 열린다(경로는 커밋에 실존).
 */
export function pointerCandidates(commit: {
  sha: string;
  parentSha?: string;
  files: readonly GitCommitFile[];
}): EvidencePointer[] {
  const out: EvidencePointer[] = [];
  for (const f of commit.files) {
    if (f.status === 'D') {
      if (commit.parentSha !== undefined) out.push({ commit: commit.parentSha, path: f.path });
    } else out.push({ commit: commit.sha, path: f.path });
  }
  return out;
}

const chronological = (a: ChangeCommit, b: ChangeCommit): number =>
  compareCodepoint(a.authoredAt, b.authoredAt) || compareCodepoint(a.sha, b.sha);

function makeBatch(
  key: string,
  period: string,
  dir: string | undefined,
  commits: ChangeCommit[],
  limits: IndexLimits,
): ChangeBatch {
  const sorted = [...commits].sort(chronological);
  const withDetail = sorted.map((c, i) => ({ ...c, detail: i < limits.commitsPerBatch }));
  return {
    key,
    period,
    ...(dir !== undefined ? { dir } : {}),
    commits: withDetail,
    summaryOnly: withDetail.some((c) => !c.detail),
  };
}

export function planChangeBatches(
  commits: readonly GitCommit[],
  limits: IndexLimits = INDEX_LIMITS,
): ChangePlan {
  let emptyCommits = 0;
  let ignoredCommits = 0;
  const byPeriod = new Map<string, ChangeCommit[]>();
  for (const c of commits) {
    if (c.files.length === 0) {
      emptyCommits += 1;
      continue;
    }
    const files = c.files.filter((f) => !isIgnoredPath(f.path));
    if (files.length === 0) {
      ignoredCommits += 1;
      continue;
    }
    const item: ChangeCommit = {
      sha: c.sha,
      ...(c.parentSha !== undefined ? { parentSha: c.parentSha } : {}),
      authoredAt: c.authoredAt,
      subject: c.subject,
      body: c.body.slice(0, limits.commitBodyChars),
      files,
      detail: true,
    };
    const period = periodOf(c.authoredAt);
    const list = byPeriod.get(period) ?? [];
    list.push(item);
    byPeriod.set(period, list);
  }

  const batches: ChangeBatch[] = [];
  for (const [period, list] of [...byPeriod.entries()].sort((a, b) =>
    compareCodepoint(a[0], b[0]),
  )) {
    if (list.length <= limits.commitsPerBatch) {
      batches.push(makeBatch(`change:${period}`, period, undefined, list, limits));
      continue;
    }
    const byDir = new Map<string, ChangeCommit[]>();
    for (const c of list) {
      const dir = primaryDir(c.files);
      const sub = byDir.get(dir) ?? [];
      sub.push(c);
      byDir.set(dir, sub);
    }
    for (const [dir, sub] of [...byDir.entries()].sort((a, b) => compareCodepoint(a[0], b[0])))
      batches.push(makeBatch(`change:${period}:${dir}`, period, dir, sub, limits));
  }
  return { totalCommits: commits.length, emptyCommits, ignoredCommits, batches };
}
