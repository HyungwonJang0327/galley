// 작업 문서(worklog·decisions) — 리포의 `decisions/`·`worklog/` 폴더에서 주제와 관련된 절을 골라 근거로 싣는다(모델 0회, 읽기만).
// 사건 전개("실수 → 발견 → 고침")와 "왜 이렇게 했나"는 커밋보다 여기에 남아 있다(decisions/evidence-collection.md
// "근거의 층과 순서"). 읽는 곳: 리포의 HEAD 커밋에 두 폴더가 있으면 git으로, **없으면 리포 바로 위 폴더**에서 디스크로
// (여러 리포를 한 폴더에 두고 문서를 그 위에 두는 구성 — 2026-11-24 사용자 결정). 디스크 쪽은 두 폴더 이름의 `.md`만,
// 심볼릭 링크는 따라가지 않는다. 제목·본문은 식별 정보 필터를 거친다. 번들에는 폴더 기준 상대 경로만 남긴다(절대경로 없음).
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gitHead, gitListFiles, gitShowFile, looksBinary } from '../index/gitRead.ts';
import type { GitFailure } from '../index/gitRead.ts';
import type { EvidenceDoc, EvidenceDocKind } from './bundle.ts';
import { EVIDENCE_LIMITS, type EvidenceLimits } from './limits.ts';
import { redact, type RedactConfig } from './redact.ts';

const DOC_DIRS: readonly EvidenceDocKind[] = ['worklog', 'decisions'];
const DOC_PATH = /^(worklog|decisions)\/[^/]+\.md$/;
const FILE_DATE = /(\d{4}-\d{2}-\d{2})\.md$/;

/** 문서 파일 하나(아직 고르기 전). */
export interface DocFile {
  kind: EvidenceDocKind;
  /** `worklog/2026-06-20.md` — 폴더 기준 상대 경로. */
  path: string;
  text: string;
}

export interface RepoDocs {
  source: 'git' | 'disk';
  /** 읽은 곳(리포 경로 또는 상위 폴더) — 같은 폴더를 두 번 읽지 않으려는 내부 키. 번들에는 쓰지 않는다. */
  root: string;
  /** git으로 읽었을 때 그 커밋. */
  commit?: string;
  files: DocFile[];
}

/** 문서를 읽을 리포 하나. */
export interface DocsRepo {
  name: string;
  path: string;
}

const kindOf = (path: string): EvidenceDocKind =>
  path.startsWith('worklog/') ? 'worklog' : 'decisions';

/** 리포의 HEAD 커밋에서 — 두 폴더 바로 아래의 `.md`만. 없으면 빈 목록. */
async function readFromGit(
  repoPath: string,
  limits: EvidenceLimits,
): Promise<{ ok: true; value: RepoDocs } | GitFailure> {
  const head = await gitHead(repoPath);
  if (!head.ok) {
    // 커밋이 하나도 없는 리포 — 문서 0건(상위 폴더를 본다).
    if (head.code === 'GIT_OBJECT_NOT_FOUND')
      return { ok: true, value: { source: 'git', root: repoPath, files: [] } };
    return head;
  }
  const listed = await gitListFiles(repoPath, head.value);
  if (!listed.ok) return listed;
  const targets = listed.value
    .filter((f) => DOC_PATH.test(f.path) && f.size <= limits.docFileBytes)
    .map((f) => f.path)
    .sort()
    .slice(0, limits.maxDocFiles);
  const files: DocFile[] = [];
  for (const path of targets) {
    const shown = await gitShowFile(repoPath, head.value, path);
    if (!shown.ok || looksBinary(shown.value)) continue;
    files.push({ kind: kindOf(path), path, text: shown.value });
  }
  return { ok: true, value: { source: 'git', root: repoPath, commit: head.value, files } };
}

/** 리포 바로 위 폴더의 `worklog/`·`decisions/`에서 — 일반 파일 `.md`만, 링크는 따라가지 않는다. 폴더가 없으면 빈 목록. */
async function readFromParent(repoPath: string, limits: EvidenceLimits): Promise<RepoDocs> {
  const files: DocFile[] = [];
  let parent: string;
  try {
    parent = dirname(await realpath(repoPath));
  } catch {
    return { source: 'disk', root: repoPath, files };
  }
  for (const kind of DOC_DIRS) {
    const folder = join(parent, kind);
    let names: string[];
    try {
      if (!(await lstat(folder)).isDirectory()) continue;
      names = await readdir(folder);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => n.endsWith('.md')).sort()) {
      if (files.length >= limits.maxDocFiles) break;
      try {
        const stat = await lstat(join(folder, name));
        if (!stat.isFile() || stat.size > limits.docFileBytes) continue;
        const text = await readFile(join(folder, name), 'utf8');
        if (looksBinary(text)) continue;
        files.push({ kind, path: `${kind}/${name}`, text });
      } catch {
        continue;
      }
    }
  }
  return { source: 'disk', root: parent, files };
}

/** 리포 안(git HEAD) 우선, 없으면 리포 바로 위 폴더(디스크). */
export async function readRepoDocs(
  repoPath: string,
  limits: EvidenceLimits = EVIDENCE_LIMITS,
): Promise<{ ok: true; value: RepoDocs } | GitFailure> {
  const fromGit = await readFromGit(repoPath, limits);
  if (!fromGit.ok) return fromGit;
  if (fromGit.value.files.length > 0) return fromGit;
  return { ok: true, value: await readFromParent(repoPath, limits) };
}

/** 문서의 절 하나 — `##`·`###` 머리글에서 끊는다(코드 펜스 안의 `#`은 머리글이 아니다). */
export interface DocSection {
  /** 머리글 경로 `문서 제목 › 절 › 소절`. */
  title: string;
  /** 1부터, 포함. */
  lineRange: { start: number; end: number };
  text: string;
}

export function splitDocSections(text: string): DocSection[] {
  const lines = text.replace(/\n$/, '').split('\n');
  const sections: DocSection[] = [];
  let h1 = '';
  let h2 = '';
  let current: { title: string; start: number; body: string[] } | null = null;
  let fence: string | null = null;
  const flush = (endLine: number) => {
    if (current === null) return;
    const body = current.body.join('\n').trim();
    // 머리글만 있고 내용이 없는 절은 근거가 아니다.
    if (body.split('\n').length > 1)
      sections.push({
        title: current.title,
        lineRange: { start: current.start, end: endLine },
        text: body,
      });
    current = null;
  };
  lines.forEach((line, i) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch !== null) {
      if (fence === null) fence = fenceMatch[1]!.charAt(0);
      else if (fenceMatch[1]!.startsWith(fence)) fence = null;
    }
    const heading =
      fence === null && fenceMatch === null ? /^(#{1,3})\s+(.+?)\s*$/.exec(line) : null;
    if (heading !== null) {
      const level = heading[1]!.length;
      const name = heading[2]!;
      if (level === 1) {
        flush(i);
        h1 = name;
        h2 = '';
        return;
      }
      flush(i);
      if (level === 2) h2 = name;
      const trail = level === 2 ? [h1, name] : [h1, h2, name];
      current = { title: trail.filter((t) => t !== '').join(' › '), start: i + 1, body: [line] };
      return;
    }
    if (current === null) {
      if (line.trim() === '') return;
      current = { title: h1, start: i + 1, body: [] };
    }
    current.body.push(line);
  });
  flush(lines.length);
  return sections;
}

/** 조사로 끝나는 한국어 낱말의 끝 한 글자(…과·…을·…에) — 제목 낱말을 본문의 "스냅"과 맞추려고 뗀다. */
const PARTICLE = /[은는이가을를과와에의로도]$/;
const HANGUL = /[가-힣]/;

/**
 * 주제 제목·키워드 → 찾을 낱말(소문자). 공백·구두점에서 끊고, 한글은 2자 이상·그 밖은 3자 이상만. 한글 낱말이 3자 이상이고
 * 조사로 끝나면 조사를 뗀 꼴도 넣는다. 괄호 안(큐의 힌트 문장)은 제목에서 뺀다.
 */
export interface DocTerms {
  /** 주제 제목에서 온 낱말 — 주제 그 자체라 무겁게 센다. */
  title: string[];
  /** 키워드(주제 힌트·근거가 온 분석 글)에서 온 낱말 — 제목 낱말과 겹치는 것은 뺀다. */
  keywords: string[];
}

export function docTerms(input: { title: string; keywords: readonly string[] }): DocTerms {
  const collect = (raws: readonly string[]): string[] => {
    const out = new Set<string>();
    for (const raw of raws) addWords(out, raw);
    return [...out];
  };
  const title = collect([input.title.replace(/\([^)]*\)/g, ' ')]);
  const inTitle = new Set(title);
  return { title, keywords: collect(input.keywords).filter((k) => !inTitle.has(k)) };
}

function addWords(out: Set<string>, raw: string): void {
  {
    for (const word of raw
      .normalize('NFC')
      .toLowerCase()
      .split(/[^\p{L}\p{N}.#+_-]+/u)) {
      const w = word.replace(/^[._-]+|[._-]+$/g, '');
      if (w === '') continue;
      const hangul = HANGUL.test(w);
      if ([...w].length < (hangul ? 2 : 3)) continue;
      out.add(w);
      if (hangul && [...w].length >= 3 && PARTICLE.test(w)) out.add(w.slice(0, -1));
    }
  }
}

interface Scored {
  repo: DocsRepo;
  docs: RepoDocs;
  file: DocFile;
  section: DocSection;
  score: number;
  matched: number;
}

export type CollectDocsResult = { ok: true; docs: EvidenceDoc[]; omitted: number } | GitFailure;

/** 제목 낱말의 가중 — 키워드 낱말의 몇 배로 세는가. */
const TITLE_WEIGHT = 3;

/**
 * 리포들의 작업 문서에서 주제 낱말이 든 절을 고른다. 점수 = 절에 든 낱말마다 `log(1 + 전체 절 수 / 그 낱말이 든 절 수)`의 합
 * (제목 낱말은 `TITLE_WEIGHT`배)을 절 길이로 누른 값 — 어디에나 나오는 낱말(프레임워크 이름)은 가볍고, 긴 절이 낱말을
 * 많이 품었다는 이유만으로 이기지 않는다. 서로 다른 낱말이 `docMinTerms`개 이상 든 절만, 종류별 상한(worklog
 * `maxWorklogSections` · decisions `maxDecisionSections`)까지 점수 순으로. 결과는 worklog(날짜순) → decisions(경로순),
 * 같은 파일 안에서는 줄 순. 같은 폴더를 두 리포가 가리키면(한 폴더 아래의 두 리포) 한 번만 읽는다.
 */
export async function collectDocs(
  repos: readonly DocsRepo[],
  terms: DocTerms,
  redactConfig: RedactConfig | null,
  limits: EvidenceLimits = EVIDENCE_LIMITS,
): Promise<CollectDocsResult> {
  const weighted = [
    ...terms.title.map((term) => ({ term, boost: TITLE_WEIGHT })),
    ...terms.keywords.map((term) => ({ term, boost: 1 })),
  ];
  if (weighted.length === 0) return { ok: true, docs: [], omitted: 0 };
  const all: Scored[] = [];
  const seenFiles = new Set<string>();
  for (const repo of repos) {
    const read = await readRepoDocs(repo.path, limits);
    if (!read.ok) return read;
    for (const file of read.value.files) {
      // 같은 폴더의 같은 파일은 한 번만(두 리포가 같은 상위 폴더를 본다).
      const key = `${read.value.root}\0${file.path}`;
      if (seenFiles.has(key)) continue;
      seenFiles.add(key);
      for (const section of splitDocSections(file.text))
        all.push({ repo, docs: read.value, file, section, score: 0, matched: 0 });
    }
  }
  if (all.length === 0) return { ok: true, docs: [], omitted: 0 };

  const lowered = all.map((s) => `${s.section.title}\n${s.section.text}`.toLowerCase());
  for (const { term, boost } of weighted) {
    const hits = lowered.map((text) => text.includes(term));
    const df = hits.filter(Boolean).length;
    if (df === 0) continue;
    // 1을 더해 누른다 — 절이 몇 개뿐인 문서에서 모든 절에 든 낱말이 0점이 되지 않게.
    const idf = Math.log(1 + all.length / df);
    all.forEach((s, i) => {
      if (!hits[i]) return;
      s.matched += 1;
      s.score += idf * boost;
    });
  }
  for (const s of all) s.score /= 1 + Math.log(1 + s.section.text.length / 800);
  const eligible = all
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.matched >= limits.docMinTerms)
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i);
  const cap = { worklog: limits.maxWorklogSections, decisions: limits.maxDecisionSections };
  const kept = eligible.filter(({ s }) => {
    if (cap[s.file.kind] <= 0) return false;
    cap[s.file.kind] -= 1;
    return true;
  });

  const order = (x: Scored): [number, string, number] => [
    x.file.kind === 'worklog' ? 0 : 1,
    x.file.path,
    x.section.lineRange.start,
  ];
  kept.sort((a, b) => {
    const [ak, ap, al] = order(a.s);
    const [bk, bp, bl] = order(b.s);
    return ak - bk || (ap < bp ? -1 : ap > bp ? 1 : 0) || al - bl;
  });

  const docs: EvidenceDoc[] = kept.map(({ s }) => {
    let redacted = false;
    const apply = (text: string): string => {
      if (redactConfig === null) return text;
      const r = redact(text, redactConfig);
      if (r.redacted) redacted = true;
      return r.text;
    };
    // redact를 절단 앞에(readSnippet과 같은 순서).
    const full = apply(s.section.text);
    const text = [...full].slice(0, limits.docSectionChars).join('');
    const date = FILE_DATE.exec(s.file.path)?.[1];
    return {
      kind: s.file.kind,
      path: s.file.path,
      lineRange: s.section.lineRange,
      source: s.docs.source,
      ...(s.docs.commit !== undefined ? { commit: s.docs.commit } : {}),
      ...(date !== undefined ? { date } : {}),
      repo: apply(s.repo.name),
      title: apply(s.section.title),
      text,
      redacted,
      truncated: text.length < full.length,
    };
  });
  return { ok: true, docs, omitted: eligible.length - kept.length };
}
