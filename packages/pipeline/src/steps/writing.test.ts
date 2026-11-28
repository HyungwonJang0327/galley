// 글쓰기 단계 공용 헬퍼 — 순수 함수라 파일·모델·DB 없이 검사한다. 러너와 엮인 동작(펜스 충돌·호출 중 abort)은 각 단계 테스트에.
import { describe, test, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  abortable,
  classifyModelError,
  fenceFor,
  hasStoryLayers,
  renderDocs,
  renderEvidenceBundle,
  renderHistory,
  tonePromptFailure,
  unwrapFence,
} from './writing.ts';
import type { EvidenceBundle, EvidenceCommit, EvidenceDoc } from '../evidence/bundle.ts';

describe('writing helpers', () => {
  test('fenceFor는 조각 안 최장 백틱보다 긴 펜스(최소 3), unwrapFence는 전체 펜스만 벗긴다', () => {
    expect(fenceFor('plain')).toBe('```');
    expect(fenceFor('a\n```md\nb\n```')).toBe('````');
    expect(fenceFor('x `````` y')).toBe('```````');
    expect(unwrapFence('```markdown\n# 본문\n\n내용\n```')).toBe('# 본문\n\n내용');
    expect(unwrapFence('```\n# 본문\n```\n')).toBe('# 본문');
    expect(unwrapFence('# 본문\n```ts\ncode\n```')).toBe('# 본문\n```ts\ncode\n```'); // 부분 펜스는 그대로
  });

  test('abortable — 끝난 신호면 즉시 거부, 아니면 결과 그대로, 도중 abort면 AbortError', async () => {
    await expect(abortable(Promise.resolve(1), new AbortController().signal)).resolves.toBe(1);
    const done = new AbortController();
    done.abort();
    await expect(abortable(new Promise(() => {}), done.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    const c = new AbortController();
    const p = abortable(new Promise(() => {}), c.signal);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('모델 호출 실패의 재시도 분류: 429·5xx·네트워크는 재시도, 401·거부는 영구, 원본은 cause', () => {
    // 실제 SDK 오류 클래스
    const rate = new Anthropic.APIError(
      429,
      { error: { type: 'rate_limit_error' } },
      'rate limited',
      undefined,
    );
    expect(classifyModelError(rate, 'X')).toMatchObject({ code: 'X', retryable: true });
    expect(
      classifyModelError(new Anthropic.APIConnectionError({ message: 'Connection error.' }), 'X')
        .retryable,
    ).toBe(true);
    expect(
      classifyModelError(new Anthropic.APIError(401, undefined, 'unauthorized', undefined), 'X')
        .retryable,
    ).toBe(false);
    expect(
      classifyModelError(
        Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' }),
        'X',
      ),
    ).toMatchObject({ retryable: true });
    expect(
      classifyModelError(Object.assign(new Error('boom'), { status: 503 }), 'X').retryable,
    ).toBe(true);
    expect(
      classifyModelError(Object.assign(new Error('x'), { name: 'APIConnectionTimeoutError' }), 'X')
        .retryable,
    ).toBe(true);
    const refusal = classifyModelError(
      new Error('모델이 응답을 거부했습니다 (stop_reason refusal)'),
      'X',
    );
    expect(refusal.retryable).toBe(false);
    expect(refusal.message).toContain('거부');
    expect(refusal.cause).toBeInstanceOf(Error);
    expect(classifyModelError(new Error('API 키 없음'), 'X').message).not.toContain('키 없음'); // 원문 대신 고정 문구
    expect(
      tonePromptFailure({ ok: false, code: 'PROMPT_UNREADABLE', step: 'linkedin' }),
    ).toMatchObject({
      code: 'PROMPT_UNREADABLE',
      retryable: false,
      message: expect.stringContaining('linkedin.md'),
    });
    expect(
      tonePromptFailure({ ok: false, code: 'PROMPT_NOT_FOUND', step: 'velog' }).message,
    ).toContain('velog.md');
    expect(tonePromptFailure({ ok: false, code: 'PROMPT_EMPTY', step: 'zenn' })).toMatchObject({
      code: 'PROMPT_EMPTY',
      retryable: false,
      message: expect.stringContaining('zenn.md'),
    });
  });
});

const LIMITS = { evidenceChars: 10_000, docsChars: 10_000, historyChars: 10_000 };
const commit = (over: Partial<EvidenceCommit> = {}): EvidenceCommit => ({
  commit: 'abcdef1234567',
  date: '2026-06-20T10:00:00+09:00',
  paths: ['src/feed.ts'],
  repo: 'api',
  subject: 'fix: 피드 정렬이 뒤집히던 문제',
  body: '커서가 createdAt만 봐서 같은 초의 글이 빠졌다.\nid를 함께 본다.',
  files: [
    { status: 'M', path: 'src/feed.ts', added: 12, deleted: 3 },
    { status: 'A', path: 'assets/a.png' },
  ],
  fileCount: 5,
  redacted: false,
  truncated: false,
  ...over,
});
const doc = (over: Partial<EvidenceDoc> = {}): EvidenceDoc => ({
  kind: 'worklog',
  path: 'worklog/2026-06-19.md',
  lineRange: { start: 3, end: 9 },
  source: 'git',
  commit: 'abc',
  date: '2026-06-19',
  repo: 'api',
  title: '2026-06-19 › 피드 버그',
  text: '## 피드 버그\n같은 초에 쓴 글이 사라졌다.',
  redacted: false,
  truncated: false,
  ...over,
});
const BUNDLE: EvidenceBundle = {
  version: 1,
  runId: 'r',
  topicId: 't',
  topicSlug: 's',
  collectedAt: '2026-09-22T00:00:00.000Z',
  items: [
    {
      commit: 'abcdef1234567',
      path: 'src/feed.ts',
      lineRange: { start: 1, end: 2 },
      date: '2026-06-20T10:00:00+09:00',
      source: 'linked',
      redacted: false,
      truncated: false,
      snippet: 'const a = 1;',
    },
  ],
  unreadable: 0,
  filtered: true,
};

describe('renderHistory · renderDocs', () => {
  test('커밋은 날짜·짧은 해시·리포·제목·본문·파일과 줄 수(잘린 파일 수 포함)로, 없으면 빈 배열', () => {
    expect(renderHistory([], 100)).toEqual([]);
    const text = renderHistory(
      [commit(), commit({ body: '', files: [], fileCount: 0 })],
      100,
      2,
    ).join('\n');
    expect(text).toContain('# 커밋 이력(2개');
    expect(text).toContain(
      '## 커밋 1 — 2026-06-20 abcdef1 (api)\n제목: fix: 피드 정렬이 뒤집히던 문제\n```\n커서가',
    );
    expect(text).toContain('파일: M src/feed.ts (+12 -3), A assets/a.png 외 3개');
    expect(text).toContain(
      '## 커밋 2 — 2026-06-20 abcdef1 (api)\n제목: fix: 피드 정렬이 뒤집히던 문제\n\n',
    ); // 본문·파일이 없으면 줄도 없다
    expect(text).toContain('(상한에 밀려 이력에서 빠진 커밋 2개)');
  });

  test('본문 총 글자 상한을 넘는 커밋은 본문만 생략하고 날짜·제목·파일은 남긴다', () => {
    const text = renderHistory([commit(), commit({ subject: '둘째', body: '둘째 본문' })], 45).join(
      '\n',
    );
    expect(text).toContain('커서가 createdAt만');
    expect(text).not.toContain('둘째 본문');
    expect(text).toContain('제목: 둘째\n(커밋 본문은 입력 상한으로 생략)');
    expect(text).toContain('(입력 상한으로 커밋 본문 1개 생략)');
  });

  test('문서 절은 경로·줄·종류·날짜·머리글과 본문으로, 상한을 넘으면 머리만, 본문의 백틱은 더 긴 펜스로', () => {
    expect(renderDocs([], 100)).toEqual([]);
    const text = renderDocs(
      [
        doc({ text: '```ts\nx\n```', truncated: true }),
        doc({
          kind: 'decisions',
          path: 'decisions/feed.md',
          date: undefined,
          title: '피드 › 검토한 방향',
          text: '가'.repeat(200),
        }),
      ],
      50,
    ).join('\n');
    expect(text).toContain('# 작업 문서(2개 절');
    expect(text).toContain(
      '## 문서 1 — worklog/2026-06-19.md L3-9 (worklog, 2026-06-19) · 2026-06-19 › 피드 버그\n````\n```ts',
    );
    expect(text).toContain('(절은 상한으로 잘렸다)');
    expect(text).toContain(
      '## 문서 2 — decisions/feed.md L3-9 (decisions) · 피드 › 검토한 방향\n(절 본문은 입력 상한으로 생략)',
    );
  });
});

describe('renderEvidenceBundle', () => {
  test('층이 없는 묶음(옛 실행)은 예전과 같은 한 절이다', () => {
    const lines = renderEvidenceBundle(BUNDLE, LIMITS);
    expect(lines[0]).toBe('# 근거 묶음(1개 조각 — 이것이 사실의 전부)');
    expect(lines.join('\n')).not.toContain('코드 조각(');
    expect(hasStoryLayers(BUNDLE)).toBe(false);
    expect(hasStoryLayers({ ...BUNDLE, docs: [], history: [] })).toBe(false);
  });

  test('층이 있으면 배경 메모 → 작업 문서 → 커밋 이력 → 코드 조각 순이고, 끝에 "이것이 사실의 전부"를 한 번 적는다', () => {
    const bundle: EvidenceBundle = {
      ...BUNDLE,
      background: { chars: 9, text: '사용자는 나 혼자', redacted: false },
      docs: [doc()],
      history: [commit()],
      historyOmitted: 0,
    };
    const text = renderEvidenceBundle(bundle, LIMITS).join('\n');
    const at = (s: string) => text.indexOf(s);
    expect(at('# 배경 메모(')).toBe(0);
    expect(at('# 배경 메모(')).toBeLessThan(at('# 작업 문서('));
    expect(at('# 작업 문서(')).toBeLessThan(at('# 커밋 이력('));
    expect(at('# 커밋 이력(')).toBeLessThan(at('# 코드 조각(1개'));
    expect(text).not.toContain('# 근거 묶음(');
    expect(text.match(/이것이 사실의 전부/g)).toHaveLength(1);
    expect(hasStoryLayers(bundle)).toBe(true);
    expect(hasStoryLayers({ ...BUNDLE, history: [commit()] })).toBe(true);
  });
});
