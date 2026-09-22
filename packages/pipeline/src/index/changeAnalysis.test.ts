import { describe, test, expect } from 'vitest';
import { analyzeChange, buildChangePrompt } from './changeAnalysis.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import type { ChangeBatch } from './changes.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import { INDEX_LIMITS } from './limits.ts';

const SHA1 = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);
const SHA3 = 'c'.repeat(40);
const BATCH: ChangeBatch = {
  key: 'change:2024-03:src',
  period: '2024-03',
  dir: 'src',
  commits: [
    {
      sha: SHA1,
      authoredAt: '2024-03-05T10:00:00+09:00',
      subject: 'feat: cart store',
      body: 'Example Corp 장바구니 도입',
      files: [{ status: 'A', path: 'src/cart/store.ts' }],
      detail: true,
    },
    {
      sha: SHA2,
      parentSha: SHA1,
      authoredAt: '2024-03-20T10:00:00+09:00',
      subject: 'refactor: move cart',
      body: '',
      files: [
        { status: 'D', path: 'src/cart/store.ts' },
        { status: 'A', path: 'src/cart/index.ts' },
      ],
      detail: true,
    },
    {
      sha: SHA3,
      parentSha: SHA2,
      authoredAt: '2024-03-25T10:00:00+09:00',
      subject: 'chore: title only',
      body: 'should not appear',
      files: [{ status: 'M', path: 'src/x.ts' }],
      detail: false,
    },
  ],
  summaryOnly: true,
};
const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};
const base = (redactConfig: RedactConfig | null = REDACT) => ({
  repoName: 'fixture',
  batch: BATCH,
  redactConfig,
});
const good = JSON.stringify({
  title: 'Example Corp 장바구니 도입과 정리',
  summary: '장바구니 스토어를 만들고 index로 옮겼다. Example Corp 전용.',
  keywords: ['Cart', 'refactor', ' cart ', 'Example Corp Cart'],
  pointers: [
    { commit: 'BBBBBBB', path: 'src/cart/index.ts', note: 'index 추가(Example Corp)' },
    { commit: 'bbbbbbb', path: 'src/cart/store.ts', note: '삭제 → 부모 커밋 기준' },
    { commit: 'bbbbbbb', path: 'not/changed.ts', note: '커밋이 안 바꾼 경로 → 버림' },
    { commit: 'ffffff', path: 'src/cart/index.ts', note: '묶음에 없는 커밋 → 버림' },
    { commit: 'main', path: 'src/cart/index.ts', note: '해시 형식 아님 → 버림' },
    { commit: 'aaaaaaa', path: 'src/cart/store.ts', note: '같은 (커밋, 경로)로 풀림 → 중복 버림' },
  ],
});

describe('buildChangePrompt', () => {
  test('상세 커밋은 본문·파일 상태를, 제목만 커밋은 한 줄로 넣는다', () => {
    const prompt = buildChangePrompt(base());
    expect(prompt).toContain('기간: 2024-03 (디렉터리: src)');
    expect(prompt).toContain('커밋 3개 (상세 2개, 나머지는 제목만)');
    expect(prompt).toContain('### aaaaaaa 2024-03-05 feat: cart store');
    expect(prompt).toContain('Example Corp 장바구니 도입');
    expect(prompt).toContain('파일: D src/cart/store.ts · A src/cart/index.ts');
    expect(prompt).toContain('- ccccccc 2024-03-25 chore: title only');
    expect(prompt).not.toContain('should not appear');
  });

  test('filesPerCommit을 넘는 파일은 "외 n개"', () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      status: 'M' as const,
      path: `src/f${i}.ts`,
    }));
    const batch: ChangeBatch = {
      ...BATCH,
      commits: [{ ...BATCH.commits[0]!, files }],
    };
    const prompt = buildChangePrompt({
      ...base(),
      batch,
      limits: { ...INDEX_LIMITS, filesPerCommit: 2 },
    });
    expect(prompt).toContain('파일: M src/f0.ts · M src/f1.ts (외 3개)');
  });
});

describe('analyzeChange', () => {
  test('포인터는 묶음 안 커밋의 실제 변경 파일만(삭제는 부모 기준), 텍스트 전부 redact, period·summaryOnly', async () => {
    const adapter = createScriptedAdapter(() => good);
    const r = await analyzeChange(adapter, base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft).toMatchObject({
      kind: 'change',
      key: 'change:2024-03:src',
      period: '2024-03',
      summaryOnly: true,
      title: '[COMPANY] 장바구니 도입과 정리',
      summary: '장바구니 스토어를 만들고 index로 옮겼다. [COMPANY] 전용.',
      keywords: ['cart', 'refactor', '[company] cart'],
      modelId: 'mock:scripted',
      filtered: true,
      redacted: true,
    });
    expect(r.draft.pointers).toEqual([
      { commit: SHA2, path: 'src/cart/index.ts', note: 'index 추가([COMPANY])' },
      { commit: SHA1, path: 'src/cart/store.ts', note: '삭제 → 부모 커밋 기준' },
    ]);
  });

  test('짧은 접두가 여러 커밋에 맞으면 그 path를 바꾼 커밋을 찾을 때까지 순회한다', async () => {
    const batch: ChangeBatch = {
      ...BATCH,
      commits: [
        {
          ...BATCH.commits[0]!,
          sha: 'abcd1' + 'a'.repeat(35),
          files: [{ status: 'M', path: 'src/one.ts' }],
        },
        {
          ...BATCH.commits[1]!,
          sha: 'abcd2' + 'b'.repeat(35),
          files: [{ status: 'M', path: 'src/two.ts' }],
        },
      ],
    };
    const adapter = createScriptedAdapter(() =>
      JSON.stringify({
        title: 't',
        summary: 's',
        pointers: [{ commit: 'abcd', path: 'src/two.ts' }],
      }),
    );
    const r = await analyzeChange(adapter, { ...base(null), batch });
    expect(r.ok && r.draft.pointers).toEqual([
      { commit: 'abcd2' + 'b'.repeat(35), path: 'src/two.ts' },
    ]);
  });

  test('유효한 포인터가 없으면 상세 커밋(최신부터)의 첫 변경 파일로 채운다', async () => {
    const adapter = createScriptedAdapter(() =>
      JSON.stringify({ title: 't', summary: 's', keywords: [], pointers: [] }),
    );
    const r = await analyzeChange(adapter, base(null));
    expect(r.ok && r.draft.pointers).toEqual([
      { commit: SHA2, path: 'src/cart/index.ts' },
      { commit: SHA1, path: 'src/cart/store.ts' },
    ]);
    expect(r.ok && r.draft.filtered).toBe(false);
  });

  test('title·summary가 없거나 JSON이 아니면 MODEL_OUTPUT_INVALID(usage 포함)', async () => {
    const r = await analyzeChange(
      createScriptedAdapter(() => '모르겠어요'),
      base(),
    );
    expect(r).toMatchObject({ ok: false, code: 'MODEL_OUTPUT_INVALID' });
    if (r.ok || r.code !== 'MODEL_OUTPUT_INVALID') return;
    expect(r.usage.inputTokens).toBeGreaterThan(0);
  });

  test('모델 호출이 던지면 MODEL_FAILED(errorName)', async () => {
    const adapter = createScriptedAdapter(() => {
      throw new TypeError('network');
    });
    expect(await analyzeChange(adapter, base())).toEqual({
      ok: false,
      code: 'MODEL_FAILED',
      errorName: 'TypeError',
    });
  });
});
