import { describe, test, expect } from 'vitest';
import { analyzeArea, buildAreaPrompt } from './areaAnalysis.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import type { AreaPlan } from './tree.ts';
import type { RedactConfig } from '../evidence/redact.ts';

const PLAN: AreaPlan = {
  key: 'area:src/cart',
  dir: 'src/cart',
  files: [
    { path: 'src/cart/index.ts', size: 120, include: true },
    { path: 'src/cart/store.ts', size: 300, include: true },
    { path: 'src/cart/huge.generated.ts', size: 999999, include: false },
  ],
  summaryOnly: true,
  includedBytes: 420,
};
const CONTENTS = [
  { path: 'src/cart/index.ts', text: 'export * from "./store";' },
  { path: 'src/cart/store.ts', text: 'line1\nline2\nline3' },
];
const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};
const base = (redactConfig: RedactConfig | null = REDACT) => ({
  repoName: 'fixture',
  commit: 'abc1234',
  plan: PLAN,
  contents: CONTENTS,
  redactConfig,
});
const good = JSON.stringify({
  title: 'Example Corp 장바구니 상태',
  summary: '장바구니 상태를 useCart 훅으로 관리한다. Example Corp 전용.',
  keywords: ['Cart', 'zustand', ' cart ', '', 'Example Corp Cart'],
  pointers: [
    { path: 'src/cart/store.ts', lineStart: 1, lineEnd: 1, note: 'useCart 훅(Example Corp)' },
    { path: 'src/cart/huge.generated.ts', note: '본문을 안 넘긴 파일 → 버린다' },
    { path: 'not/in/plan.ts' },
    { path: 'src/cart/index.ts', lineStart: 1, lineEnd: 1 },
    { path: 'src/cart/store.ts', lineStart: 3, lineEnd: 2 },
    { path: 'src/cart/store.ts', lineStart: 2, lineEnd: 99999, note: '끝이 넘침 → clamp' },
    { path: 'src/cart/store.ts', lineStart: 50, lineEnd: 60, note: '시작이 넘침 → 버림' },
  ],
});

describe('buildAreaPrompt', () => {
  test('파일 목록(이름만 표시 포함)과 실제 읽은 본문만 넣는다', () => {
    const prompt = buildAreaPrompt(base());
    expect(prompt).toContain('디렉터리: src/cart');
    expect(prompt).toContain('- src/cart/huge.generated.ts (999999 bytes, 이름만)');
    expect(prompt).toContain('### src/cart/store.ts');
    expect(prompt).not.toContain('### src/cart/huge.generated.ts');
    // include=true지만 읽지 못한 파일은 "이름만"으로 표시된다(contents가 진실)
    const missing = buildAreaPrompt({ ...base(), contents: CONTENTS.slice(1) });
    expect(missing).toContain('- src/cart/index.ts (120 bytes, 이름만)');
    expect(missing).not.toContain('### src/cart/index.ts');
  });
});

describe('analyzeArea', () => {
  test('JSON 검증 → redact(title·summary·keywords·note) → 포인터 보정(읽은 파일만·commit·라인 정렬·clamp·범위 밖 버림)', async () => {
    const adapter = createScriptedAdapter(() => good);
    const r = await analyzeArea(adapter, base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.draft;
    expect(d.key).toBe('area:src/cart');
    expect(d.title).toBe('[COMPANY] 장바구니 상태');
    expect(d.summary).toContain('[COMPANY] 전용');
    expect(d.keywords).toEqual(['cart', 'zustand', '[company] cart']);
    expect(d.pointers).toEqual([
      {
        commit: 'abc1234',
        path: 'src/cart/store.ts',
        lineStart: 1,
        lineEnd: 1,
        note: 'useCart 훅([COMPANY])',
      },
      { commit: 'abc1234', path: 'src/cart/index.ts', lineStart: 1, lineEnd: 1 },
      { commit: 'abc1234', path: 'src/cart/store.ts', lineStart: 2, lineEnd: 3 },
      {
        commit: 'abc1234',
        path: 'src/cart/store.ts',
        lineStart: 2,
        lineEnd: 3,
        note: '끝이 넘침 → clamp',
      },
    ]);
    expect(d.summaryOnly).toBe(true);
    expect(d.filtered).toBe(true);
    expect(d.redacted).toBe(true);
    expect(d.modelId).toBe('mock:scripted');
    expect(adapter.calls[0]!.system).toContain('JSON');
  });

  test('코드 펜스·앞뒤 설명이 붙어도, 앞에 다른 펜스가 있어도 JSON을 뽑는다', async () => {
    expect(
      (
        await analyzeArea(
          createScriptedAdapter(() => `결과:\n\`\`\`json\n${good}\n\`\`\`\n끝.`),
          base(),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await analyzeArea(
          createScriptedAdapter(() => `\`\`\`ts\nconst x = 1;\n\`\`\`\n${good}`),
          base(),
        )
      ).ok,
    ).toBe(true);
  });

  test('유효한 포인터가 없으면 읽은 파일 전체를 포인터로(≥ 1 보장)', async () => {
    const r = await analyzeArea(
      createScriptedAdapter(() => JSON.stringify({ title: 't', summary: 's', pointers: [] })),
      base(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.pointers).toEqual([
      { commit: 'abc1234', path: 'src/cart/index.ts' },
      { commit: 'abc1234', path: 'src/cart/store.ts' },
    ]);
  });

  test('본문을 하나도 못 넘긴 영역(전부 상한 초과)은 계획의 파일 전체를 라인 없는 포인터로 삼아 summaryOnly 글을 남긴다', async () => {
    const plan: AreaPlan = {
      ...PLAN,
      files: PLAN.files.map((f) => ({ ...f, include: false })),
      summaryOnly: true,
    };
    const r = await analyzeArea(
      createScriptedAdapter(() => JSON.stringify({ title: 't', summary: 's' })),
      { ...base(), plan, contents: [] },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.pointers.map((p) => p.path)).toEqual(PLAN.files.map((f) => f.path));
    expect(r.draft.summaryOnly).toBe(true);
  });

  test('계획엔 include였지만 읽지 못한 파일이 있으면 summaryOnly=true', async () => {
    const r = await analyzeArea(
      createScriptedAdapter(() => good),
      {
        ...base(),
        plan: { ...PLAN, summaryOnly: false, files: PLAN.files.slice(0, 2) },
        contents: CONTENTS.slice(1),
      },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.summaryOnly).toBe(true);
  });

  test('redactConfig가 null이면 filtered=false·redacted=false이고 텍스트 그대로', async () => {
    const r = await analyzeArea(
      createScriptedAdapter(() => good),
      base(null),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.title).toBe('Example Corp 장바구니 상태');
    expect(r.draft.keywords).toContain('example corp cart');
    expect(r.draft.filtered).toBe(false);
    expect(r.draft.redacted).toBe(false);
  });

  test('키워드·제목은 저장 경계로 잘린다', async () => {
    const many = JSON.stringify({
      title: 'x'.repeat(500),
      summary: 's',
      keywords: Array.from({ length: 30 }, (_, i) => `k${i}`),
      pointers: [],
    });
    const r = await analyzeArea(
      createScriptedAdapter(() => many),
      base(null),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.title).toHaveLength(200);
    expect(r.draft.keywords).toHaveLength(20);
  });

  test('출력이 깨지면 MODEL_OUTPUT_INVALID(usage 포함), 어댑터가 던지면 MODEL_FAILED(errorName)', async () => {
    const bad = await analyzeArea(
      createScriptedAdapter(() => '그냥 문장'),
      base(),
    );
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.code).toBe('MODEL_OUTPUT_INVALID');
    if (bad.code === 'MODEL_OUTPUT_INVALID') expect(bad.usage.inputTokens).toBeGreaterThan(0);
    expect(
      (
        await analyzeArea(
          createScriptedAdapter(() => JSON.stringify({ title: '', summary: 's' })),
          base(),
        )
      ).ok,
    ).toBe(false);
    const throwing = createScriptedAdapter(() => {
      throw new TypeError('network');
    });
    expect(await analyzeArea(throwing, base())).toEqual({
      ok: false,
      code: 'MODEL_FAILED',
      errorName: 'TypeError',
    });
  });
});
