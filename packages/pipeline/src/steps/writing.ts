// 글쓰기 단계(벨로그·링크드인·Zenn)가 함께 쓰는 헬퍼 — 어투 실패 → StepFailure, 모델 호출 실패의 재시도 분류, 호출을 signal과
// 경주, 프롬프트 펜스, 전체 펜스 벗기기. BS2에서 velogStep.ts에 두었던 것을 BS4에서 이동(동작 변화 없음 —
// decisions/evidence-collection.md 2026-09-23 BS3 리뷰 반영). 단계별 러너 골격은 각 단계 파일에 있다.
import { StepFailure } from './StepRunner.ts';
import type { TonePromptFailure } from '../prompts/tonePrompts.ts';
import type {
  EvidenceBackground,
  EvidenceBundle,
  EvidenceCommit,
  EvidenceDoc,
  EvidenceItem,
} from '../evidence/bundle.ts';

/** 어투 로더의 값 실패 → 단계 실패(재시도 불가). 벨로그·링크드인·Zenn 단계가 같은 헬퍼를 쓴다. 문구에 절대경로 없음(파일명만). */
export function tonePromptFailure(failure: TonePromptFailure): StepFailure {
  const file = `${failure.step}.md`;
  const message =
    failure.code === 'PROMPT_NOT_FOUND'
      ? `어투 프롬프트 파일(${file})이 없습니다.`
      : failure.code === 'PROMPT_EMPTY'
        ? `어투 프롬프트 파일(${file})이 비어 있습니다.`
        : `어투 프롬프트 파일(${file})을 읽지 못했습니다.`;
  return new StepFailure(failure.code, message, false);
}

/** 어댑터가 거부 응답에 붙이는 고정 접두(Anthropic·OpenAI 둘 다) — 이것으로만 거부를 판정한다. */
const REFUSAL_PREFIX = '모델이 응답을 거부했습니다';

/**
 * 모델 호출 실패의 재시도 분류(decisions/error-handling.md): 네트워크·레이트리밋·5xx·타임아웃은 재시도, 인증·거부·프롬프트 초과는
 * 영구. SDK 오류는 `status`를 갖고, 연결 오류는 클래스 이름·문구로 안다. 행에 남는 문구는 고정(원본은 cause로 — 응답 원문·키가
 * 남지 않게).
 */
export function classifyModelError(error: unknown, code: string): StepFailure {
  const status =
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
      ? error.status
      : undefined;
  const names = error instanceof Error ? `${error.constructor.name} ${error.name}` : '';
  const message = error instanceof Error ? error.message : String(error);
  const transient =
    (status !== undefined &&
      (status === 408 || status === 409 || status === 429 || status >= 500)) ||
    /connection|timeout|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(`${names} ${message}`);
  const refusal = !transient && message.startsWith(REFUSAL_PREFIX);
  const text = transient
    ? '모델 호출이 일시적으로 실패했습니다(네트워크·레이트리밋). 다시 시도합니다.'
    : refusal
      ? '모델이 응답을 거부했습니다. 입력(근거·지시)을 확인하세요.'
      : '모델 호출에 실패했습니다(인증·모델·입력 크기를 확인하세요).';
  return new StepFailure(code, text, transient, { cause: error });
}

/**
 * 호출을 signal과 경주시킨다 — 어댑터는 signal을 받지 않아 호출 자체는 끊지 못하지만(GenerateInput에 자리 없음), 단계는 워커의
 * 타임아웃·종료 신호에 즉시 반환된다. 끊긴 호출의 결과는 버린다.
 */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
const abortError = (): Error => {
  const e = new Error('실행이 중단되었습니다.');
  e.name = 'AbortError';
  return e;
};

/** 조각 안 최장 백틱 연속보다 긴 펜스(최소 3) — 조각의 ```가 프롬프트 구조를 닫지 못하게. */
export function fenceFor(text: string): string {
  let longest = 0;
  for (const m of text.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/** 모델이 전체를 하나의 코드 펜스로 감싼 경우 벗긴다(각 단계의 SYSTEM 머리가 금지하지만 강제는 아니다). */
export function unwrapFence(text: string): string {
  const m = /^(`{3,})(?:markdown|md)?\s*\n([\s\S]*?)\n\1\s*$/.exec(text);
  return m === null ? text : m[2]!;
}

/**
 * 배경 메모를 프롬프트 줄로 — 작성자가 직접 적은 조건·동기라 근거 묶음의 일부다(조각보다 앞에 둔다). 메모가 없으면 빈 배열
 * (절 자체가 없다). 메모 안의 백틱이 구조를 닫지 못하게 동적 펜스로 감싼다.
 */
export function renderBackground(background: EvidenceBackground | undefined): string[] {
  if (background === undefined || background.text.trim() === '') return [];
  const fence = fenceFor(background.text);
  return [
    '# 배경 메모(작성자가 직접 적은 조건·동기 — 근거 묶음의 일부)',
    fence,
    background.text,
    fence,
    '',
  ];
}

/**
 * 근거 조각을 프롬프트 줄로 — 조각마다 머리(경로·라인·커밋·날짜·출처)·note·동적 펜스 안 본문. 총 글자 상한을 넘는 조각은
 * 본문을 생략하고 포인터만 남긴다. 벨로그 본문(사실의 전부)과 근거 검증(대조 대상)이 같은 표현을 쓴다.
 */
export function renderEvidenceItems(
  items: readonly EvidenceItem[],
  evidenceChars: number,
): string[] {
  const lines: string[] = [];
  let used = 0;
  let omitted = 0;
  items.forEach((item, i) => {
    lines.push(
      `## 조각 ${i + 1} — ${item.path} L${item.lineRange.start}-${item.lineRange.end} (${item.commit.slice(0, 7)}, ${item.date.slice(0, 10)}, ${item.source})`,
    );
    if (item.note !== undefined) lines.push(`note: ${item.note}`);
    if (used + item.snippet.length <= evidenceChars) {
      const fence = fenceFor(item.snippet);
      lines.push(fence, item.snippet, fence);
      used += item.snippet.length;
    } else {
      omitted += 1;
      lines.push('(조각 본문은 입력 상한으로 생략 — 경로·라인만 참고)');
    }
    if (item.truncated) lines.push('(조각은 상한으로 잘렸다)');
    lines.push('');
  });
  if (omitted > 0) lines.push(`(입력 상한으로 조각 본문 ${omitted}개 생략)`, '');
  return lines;
}

/**
 * 작업 문서(worklog·decisions)의 절을 프롬프트 줄로 — 절마다 머리(경로·줄·날짜·머리글 경로)와 동적 펜스 안 본문. 없으면 빈 배열.
 * 총 글자 상한을 넘는 절은 본문을 생략하고 머리만 남긴다. 번호는 판정 사유가 "문서 2"처럼 가리키는 데 쓴다.
 */
export function renderDocs(docs: readonly EvidenceDoc[], docsChars: number): string[] {
  if (docs.length === 0) return [];
  const lines: string[] = [
    `# 작업 문서(${docs.length}개 절 — 근거 묶음의 일부. 작업하던 그때 적은 기록, worklog는 날짜순)`,
  ];
  let used = 0;
  let omitted = 0;
  docs.forEach((doc, i) => {
    const date = doc.date === undefined ? '' : `, ${doc.date}`;
    lines.push(
      `## 문서 ${i + 1} — ${doc.path} L${doc.lineRange.start}-${doc.lineRange.end} (${doc.kind}${date}) · ${doc.title}`,
    );
    if (used + doc.text.length <= docsChars) {
      const fence = fenceFor(doc.text);
      lines.push(fence, doc.text, fence);
      used += doc.text.length;
    } else {
      omitted += 1;
      lines.push('(절 본문은 입력 상한으로 생략)');
    }
    if (doc.truncated) lines.push('(절은 상한으로 잘렸다)');
    lines.push('');
  });
  if (omitted > 0) lines.push(`(입력 상한으로 절 본문 ${omitted}개 생략)`, '');
  return lines;
}

const fileLine = (f: EvidenceCommit['files'][number]): string =>
  f.added === undefined && f.deleted === undefined
    ? `${f.status} ${f.path}`
    : `${f.status} ${f.path} (+${f.added ?? 0} -${f.deleted ?? 0})`;

/**
 * 커밋 이력을 프롬프트 줄로 — 커밋마다 머리(날짜·짧은 해시·리포)·제목·본문(동적 펜스)·바뀐 파일과 줄 수. 묶음의 순서(오래된 순) 그대로.
 * 없으면 빈 배열. 총 글자 상한을 넘는 커밋은 본문을 생략하고 날짜·제목·파일만 남긴다(타임라인에는 그것으로 충분하다).
 */
export function renderHistory(
  history: readonly EvidenceCommit[],
  historyChars: number,
  omittedCommits = 0,
): string[] {
  if (history.length === 0) return [];
  const lines: string[] = [
    `# 커밋 이력(${history.length}개 — 근거 묶음의 일부. 오래된 순, 코드 조각의 파일을 건드린 커밋)`,
  ];
  let used = 0;
  let omitted = 0;
  history.forEach((c, i) => {
    lines.push(
      `## 커밋 ${i + 1} — ${c.date.slice(0, 10)} ${c.commit.slice(0, 7)} (${c.repo})`,
      `제목: ${c.subject}`,
    );
    if (c.body.trim() !== '') {
      if (used + c.body.length <= historyChars) {
        const fence = fenceFor(c.body);
        lines.push(fence, c.body, fence);
        used += c.body.length;
      } else {
        omitted += 1;
        lines.push('(커밋 본문은 입력 상한으로 생략)');
      }
    }
    if (c.files.length > 0) {
      const more = c.fileCount > c.files.length ? ` 외 ${c.fileCount - c.files.length}개` : '';
      lines.push(`파일: ${c.files.map(fileLine).join(', ')}${more}`);
    }
    lines.push('');
  });
  if (omitted > 0) lines.push(`(입력 상한으로 커밋 본문 ${omitted}개 생략)`, '');
  if (omittedCommits > 0) lines.push(`(상한에 밀려 이력에서 빠진 커밋 ${omittedCommits}개)`, '');
  return lines;
}

export interface EvidenceRenderLimits {
  evidenceChars: number;
  docsChars: number;
  historyChars: number;
}

/**
 * 근거 묶음 전체를 프롬프트 줄로 — **배경 메모 → 작업 문서 → 커밋 이력 → 코드 조각**(decisions "근거의 층과 순서"). 벨로그 본문(사실의
 * 전부)과 근거 검증(대조 대상)이 같은 표현을 쓴다. 층이 하나도 없는 묶음(옛 실행)은 예전과 같은 한 절(`# 근거 묶음(N개 조각 …)`)이다.
 */
export function renderEvidenceBundle(
  bundle: EvidenceBundle,
  limits: EvidenceRenderLimits,
): string[] {
  const layers = [
    ...renderBackground(bundle.background),
    ...renderDocs(bundle.docs ?? [], limits.docsChars),
    ...renderHistory(bundle.history ?? [], limits.historyChars, bundle.historyOmitted ?? 0),
  ];
  const items = renderEvidenceItems(bundle.items, limits.evidenceChars);
  if (layers.length === 0)
    return [`# 근거 묶음(${bundle.items.length}개 조각 — 이것이 사실의 전부)`, ...items];
  return [
    ...layers,
    `# 코드 조각(${bundle.items.length}개 — 근거 묶음의 일부. 각 커밋 시점의 파일 내용)`,
    ...items,
    '(근거 묶음 = 위의 배경 메모·작업 문서·커밋 이력·코드 조각 — 이것이 사실의 전부)',
    '',
  ];
}

/** 묶음에 이야기의 재료(배경 메모·작업 문서·커밋 이력)가 하나라도 있는가 — 본문 고정 머리의 서술 규칙을 붙일 조건. */
export function hasStoryLayers(bundle: EvidenceBundle): boolean {
  return (
    (bundle.background !== undefined && bundle.background.text.trim() !== '') ||
    (bundle.docs ?? []).length > 0 ||
    (bundle.history ?? []).length > 0
  );
}
