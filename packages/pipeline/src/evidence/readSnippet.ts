// 포인터 하나 → 원본 조각. `git cat-file blob <commit>:<path>`(읽기만)로 파일을 읽어 라인 범위를 자르고, 식별 정보 필터를
// 조각과 note에 건 뒤, 상한(줄·바이트)을 건다. 커밋 작성일은 gitCommitMeta(호출자가 커밋별 캐시를 주입할 수 있다).
// 예상된 실패(커밋·경로 없음·바이너리·빈 파일·범위 초과)는 값으로 — 호출자가 "읽지 못한 포인터"로 센다.
import { redact, type RedactConfig } from './redact.ts';
import { gitCommitMeta, gitShowFile, looksBinary } from '../index/gitRead.ts';
import type { GitCommitMeta, GitFailure, GitResult } from '../index/gitRead.ts';
import type { EvidencePointer } from '../index/schema.ts';
import { EVIDENCE_LIMITS, type EvidenceLimits } from './limits.ts';

export interface SnippetRead {
  snippet: string;
  lineRange: { start: number; end: number };
  date: string;
  note?: string;
  redacted: boolean;
  truncated: boolean;
}

export type ReadSnippetResult =
  | { ok: true; value: SnippetRead }
  | GitFailure
  /** NUL이 든 바이너리 — 모델에 보내지 않는다. */
  | { ok: false; code: 'SNIPPET_BINARY' }
  /** 0줄 파일 — 근거 가치가 없고 라인 범위가 거짓이 된다. */
  | { ok: false; code: 'SNIPPET_EMPTY' }
  /** 시작 줄이 파일을 넘는다 — 커밋은 불변이므로 인덱서 버그·잘못 쓴 수동 포인터다. 엉뚱한 조각을 근거로 내지 않는다. */
  | { ok: false; code: 'SNIPPET_RANGE_OUT_OF_FILE' };

/** 커밋 메타 해석기 — 기본은 gitCommitMeta. 단계는 같은 커밋을 여러 포인터가 가리키므로 캐시를 주입한다. */
export type CommitMetaResolver = (
  repoPath: string,
  commit: string,
) => Promise<GitResult<GitCommitMeta>>;

/** 줄 수 — 끝 개행은 빈 줄로 세지 않는다(인덱서 lineCount와 같은 규칙). */
const splitLines = (text: string): string[] =>
  text === '' ? [] : text.replace(/\n$/, '').split('\n');

/** UTF-8 바이트 상한으로 자른다(문자 경계 유지). */
function clampBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return { text, truncated: false };
  let out = '';
  let bytes = 0;
  for (const ch of text) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > maxBytes) break;
    out += ch;
    bytes += b;
  }
  return { text: out, truncated: true };
}

export async function readPointerSnippet(
  repoPath: string,
  pointer: EvidencePointer,
  redactConfig: RedactConfig | null,
  limits: EvidenceLimits = EVIDENCE_LIMITS,
  resolveMeta: CommitMetaResolver = gitCommitMeta,
): Promise<ReadSnippetResult> {
  const meta = await resolveMeta(repoPath, pointer.commit);
  if (!meta.ok) return meta;
  const shown = await gitShowFile(repoPath, pointer.commit, pointer.path);
  if (!shown.ok) return shown;
  if (looksBinary(shown.value)) return { ok: false, code: 'SNIPPET_BINARY' };

  const lines = splitLines(shown.value);
  const total = lines.length;
  if (total === 0) return { ok: false, code: 'SNIPPET_EMPTY' };
  // 라인 범위: 시작이 파일을 넘으면 거부(값), 끝은 파일 안으로 clamp.
  const start = pointer.lineStart ?? 1;
  if (start > total) return { ok: false, code: 'SNIPPET_RANGE_OUT_OF_FILE' };
  const requestedEnd = pointer.lineEnd ?? total;
  const end = Math.max(start, Math.min(requestedEnd, total));
  const cappedEnd = Math.min(end, start + limits.snippetLines - 1);
  let truncated = cappedEnd < end;

  let redacted = false;
  const apply = (text: string): string => {
    if (redactConfig === null) return text;
    const r = redact(text, redactConfig);
    if (r.redacted) redacted = true;
    return r.text;
  };
  // redact를 **절단 앞에** — 절단 경계에서 잘린 회사명 접두가 필터를 빠져나가지 않게(BE8 리뷰 1). 상한은 마지막 clamp가 보장.
  const slice = apply(lines.slice(start - 1, cappedEnd).join('\n'));
  const clamped = clampBytes(slice, limits.snippetBytes);
  truncated = truncated || clamped.truncated;
  // 절단 뒤 실제 담긴 줄 수로 끝을 다시 센다(반쯤 잘린 마지막 줄도 포함) — 포인터가 없는 줄을 가리키지 않게(리뷰 2).
  const containedEnd = clamped.truncated ? start + clamped.text.split('\n').length - 1 : cappedEnd;
  const note = pointer.note === undefined ? undefined : apply(pointer.note);
  return {
    ok: true,
    value: {
      snippet: clamped.text,
      lineRange: { start, end: containedEnd },
      date: meta.value.authoredAt,
      ...(note !== undefined ? { note } : {}),
      redacted,
      truncated,
    },
  };
}
