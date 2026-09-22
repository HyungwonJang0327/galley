// 포인터 하나 → 원본 조각. `git show <commit>:<path>`(읽기만)로 파일을 읽어 라인 범위를 자르고, 상한(줄·바이트)을 걸고,
// 식별 정보 필터를 조각과 note에 건다. 커밋 작성일은 gitCommitMeta. 예상된 실패(커밋·경로 없음)는 값으로 — 호출자가
// "읽지 못한 포인터"로 센다.
import { redact, type RedactConfig } from './redact.ts';
import { gitCommitMeta, gitShowFile, looksBinary } from '../index/gitRead.ts';
import type { GitFailure } from '../index/gitRead.ts';
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
  | { ok: false; code: 'SNIPPET_BINARY' };

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
): Promise<ReadSnippetResult> {
  const meta = await gitCommitMeta(repoPath, pointer.commit);
  if (!meta.ok) return meta;
  const shown = await gitShowFile(repoPath, pointer.commit, pointer.path);
  if (!shown.ok) return shown;
  if (looksBinary(shown.value)) return { ok: false, code: 'SNIPPET_BINARY' };

  const lines = splitLines(shown.value);
  const total = lines.length;
  // 라인 범위: 시작이 파일을 넘으면 1부터(포인터가 낡았어도 파일은 보여준다), 끝은 파일 안으로 clamp.
  const start =
    pointer.lineStart !== undefined && pointer.lineStart <= total ? pointer.lineStart : 1;
  const requestedEnd = pointer.lineEnd ?? total;
  const end = Math.max(start, Math.min(requestedEnd, total));
  const cappedEnd = Math.min(end, start + limits.snippetLines - 1);
  let truncated = cappedEnd < end;
  const slice = lines.slice(start - 1, cappedEnd).join('\n');
  const clamped = clampBytes(slice, limits.snippetBytes);
  truncated = truncated || clamped.truncated;

  let redacted = false;
  const apply = (text: string): string => {
    if (redactConfig === null) return text;
    const r = redact(text, redactConfig);
    if (r.redacted) redacted = true;
    return r.text;
  };
  const snippet = apply(clamped.text);
  const note = pointer.note === undefined ? undefined : apply(pointer.note);
  return {
    ok: true,
    value: {
      snippet,
      lineRange: { start, end: total === 0 ? start : cappedEnd },
      date: meta.value.authoredAt,
      ...(note !== undefined ? { note } : {}),
      redacted,
      truncated,
    },
  };
}
