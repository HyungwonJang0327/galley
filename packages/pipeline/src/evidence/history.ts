// 커밋 이력 — 번들에 담긴 조각의 파일들을 건드린 커밋을 `git log`로 읽어(읽기만, 모델 0회) 날짜·제목·본문·바뀐 파일·줄 수로 만든다.
// 파일 스냅숏만으로는 "언제 넣고 며칠 뒤 무엇을 고쳤는가"가 없어 본문이 코드 해설이 된다(decisions/evidence-collection.md
// "근거의 층과 순서"). diff 본문은 읽지 않는다. 제목·본문·리포 이름은 식별 정보 필터를 거친다.
import { gitLog, type GitCommit, type GitFailure } from '../index/gitRead.ts';
import type { EvidenceCommit, EvidenceCommitFile } from './bundle.ts';
import { EVIDENCE_LIMITS, type EvidenceLimits } from './limits.ts';
import { redact, type RedactConfig } from './redact.ts';

/** 이력을 읽을 리포 하나 — `paths`는 번들 조각의 경로(리포 루트 기준). */
export interface HistoryRepo {
  name: string;
  path: string;
  paths: readonly string[];
}

export type CollectHistoryResult =
  { ok: true; history: EvidenceCommit[]; omitted: number } | GitFailure;

interface Candidate {
  repo: HistoryRepo;
  commit: GitCommit;
  /** 조각 경로 중 이 커밋이 건드린 것(조각 경로 순). */
  touched: string[];
  time: number;
  /** 읽은 순서(리포 순 → 최신 순) — 같은 시각의 커밋 순서를 결정적으로. */
  seq: number;
}

/** 서명 꼬리표 줄(사람·도구 이름과 이메일) — 근거가 아니고 이메일이 번들에 남는다. 본문에서 뺀다. */
const TRAILER = /^(?:co-authored-by|signed-off-by):/i;
const stripTrailers = (body: string): string =>
  body
    .split('\n')
    .filter((line) => !TRAILER.test(line.trim()))
    .join('\n')
    .trim();

/** 오래된 순. 같은 시각이면 git이 더 오래됐다고 한 것(같은 리포 안에서 뒤에 읽힌 것) 먼저. */
const byTime = (a: Candidate, b: Candidate): number => a.time - b.time || b.seq - a.seq;

function toEvidenceCommit(
  candidate: Candidate,
  redactConfig: RedactConfig | null,
  limits: EvidenceLimits,
): EvidenceCommit {
  const { commit, repo, touched } = candidate;
  let redacted = false;
  const apply = (text: string): string => {
    if (redactConfig === null) return text;
    const r = redact(text, redactConfig);
    if (r.redacted) redacted = true;
    return r.text;
  };
  // redact를 절단 앞에 — 잘린 회사명 접두가 필터를 빠져나가지 않게(readSnippet과 같은 순서).
  const fullBody = apply(stripTrailers(commit.body));
  const body = [...fullBody].slice(0, limits.historyBodyChars).join('');
  const touchedSet = new Set(touched);
  // 조각 파일을 먼저(이 커밋이 이력에 든 이유), 나머지는 git 순서.
  const ordered = [
    ...commit.files.filter((f) => touchedSet.has(f.path)),
    ...commit.files.filter((f) => !touchedSet.has(f.path)),
  ];
  const files: EvidenceCommitFile[] = ordered.slice(0, limits.historyFilesPerCommit).map((f) => ({
    status: f.status,
    path: f.path,
    ...(f.added !== undefined ? { added: f.added } : {}),
    ...(f.deleted !== undefined ? { deleted: f.deleted } : {}),
  }));
  return {
    commit: commit.sha,
    date: commit.authoredAt,
    paths: touched,
    repo: apply(repo.name),
    subject: apply(commit.subject),
    body,
    files,
    fileCount: commit.files.length,
    redacted,
    truncated: body.length < fullBody.length || files.length < commit.files.length,
  };
}

/**
 * 리포마다 HEAD까지의 이력에서 조각 경로를 건드린 커밋을 모은다(병합 제외, 리포당 최신 `historyScanCommits`개까지).
 * 전체가 `maxHistoryCommits`를 넘으면 조각 파일을 많이 건드린 커밋 먼저, 같으면 오래된 것 먼저 남기고 — 결과는 항상 오래된 순.
 * 리포 수준 실패(git 리포가 아님·명령 실패)는 값으로 돌려준다. 커밋이 하나도 없는 리포(HEAD 없음)는 이력 0건이다.
 */
export async function collectHistory(
  repos: readonly HistoryRepo[],
  redactConfig: RedactConfig | null,
  limits: EvidenceLimits = EVIDENCE_LIMITS,
): Promise<CollectHistoryResult> {
  const candidates: Candidate[] = [];
  for (const repo of repos) {
    if (repo.paths.length === 0) continue;
    const log = await gitLog(repo.path, {
      to: 'HEAD',
      maxCommits: limits.historyScanCommits,
      paths: repo.paths,
      numstat: true,
    });
    if (!log.ok) {
      if (log.code === 'GIT_OBJECT_NOT_FOUND') continue;
      return log;
    }
    for (const commit of log.value.commits) {
      const changed = new Set(commit.files.map((f) => f.path));
      const touched = repo.paths.filter((p) => changed.has(p));
      // 경로로 골랐는데 파일 목록에 없으면(심볼릭 링크·서브모듈로 걸러짐) 이력에 든 이유를 댈 수 없다 — 뺀다.
      if (touched.length === 0) continue;
      const time = Date.parse(commit.authoredAt);
      candidates.push({
        repo,
        commit,
        touched,
        time: Number.isNaN(time) ? 0 : time,
        seq: candidates.length,
      });
    }
  }
  const kept =
    candidates.length <= limits.maxHistoryCommits
      ? candidates
      : [...candidates]
          .sort((a, b) => b.touched.length - a.touched.length || byTime(a, b))
          .slice(0, limits.maxHistoryCommits);
  return {
    ok: true,
    history: [...kept].sort(byTime).map((c) => toEvidenceCommit(c, redactConfig, limits)),
    omitted: candidates.length - kept.length,
  };
}
