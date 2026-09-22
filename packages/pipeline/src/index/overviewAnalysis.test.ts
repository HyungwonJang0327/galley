import { describe, test, expect } from 'vitest';
import {
  analyzeOverview,
  buildOverviewPrompt,
  selectOverviewSources,
  type OverviewSource,
} from './overviewAnalysis.ts';
import { createScriptedAdapter } from '../model/testing/scriptedAdapter.ts';
import type { RedactConfig } from '../evidence/redact.ts';
import { INDEX_LIMITS } from './limits.ts';

const SHA = 'a'.repeat(40);
const src = (
  key: string,
  kind: 'area' | 'change',
  period: string | null,
  title = key,
): OverviewSource => ({
  key,
  kind,
  title,
  summary: `${key} 요약`,
  keywords: [key],
  period,
  pointers: [{ commit: SHA, path: `${key}.ts`, lineStart: 1, lineEnd: 3, note: 'ignored' }],
});
const SOURCES: OverviewSource[] = [
  src('change:2024-04', 'change', '2024-04'),
  src('area:src', 'area', null, 'Example Corp 소스'),
  src('change:2024-03', 'change', '2024-03'),
  src('area:docs', 'area', null),
];
const REDACT: RedactConfig = {
  version: 1,
  rules: [{ id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' }],
};
const base = (redactConfig: RedactConfig | null = REDACT) => ({
  repoName: 'fixture',
  sources: SOURCES,
  redactConfig,
});

describe('selectOverviewSources · buildOverviewPrompt', () => {
  test('area 전부(키 순) + change는 최근 기간부터, 상한을 넘으면 자르고 truncated', () => {
    const all = selectOverviewSources(SOURCES);
    expect(all.selected.map((s) => s.key)).toEqual([
      'area:docs',
      'area:src',
      'change:2024-04',
      'change:2024-03',
    ]);
    expect(all.truncated).toBe(false);
    const cut = selectOverviewSources(SOURCES, { ...INDEX_LIMITS, overviewSources: 3 });
    expect(cut.selected.map((s) => s.key)).toEqual(['area:docs', 'area:src', 'change:2024-04']);
    expect(cut.truncated).toBe(true);
  });

  test('프롬프트는 영역·변경(오래된 순)으로 나눠 제목·요약·키워드를 넣는다', () => {
    const prompt = buildOverviewPrompt(base());
    expect(prompt).toContain('분석 글 4개 (영역 2, 변경 2)');
    expect(prompt.indexOf('### change:2024-03')).toBeLessThan(prompt.indexOf('### change:2024-04'));
    expect(prompt).toContain('### area:src — Example Corp 소스');
    expect(prompt).toContain('키워드: area:src');
  });
});

describe('analyzeOverview', () => {
  test('출처 키를 해석해 그 글의 첫 포인터를 물려받고(라인 유지, note는 출처 제목), 텍스트 redact', async () => {
    const adapter = createScriptedAdapter(() =>
      JSON.stringify({
        title: 'Example Corp 커머스 백엔드',
        summary: '주문·결제를 다루는 서비스. Example Corp.',
        keywords: ['Commerce', 'Example Corp'],
        sources: ['area:src', 'change:2024-04', 'area:src', 'nope', 42],
      }),
    );
    const r = await analyzeOverview(adapter, base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft).toMatchObject({
      kind: 'overview',
      key: 'overview',
      period: null,
      summaryOnly: false,
      title: '[COMPANY] 커머스 백엔드',
      summary: '주문·결제를 다루는 서비스. [COMPANY].',
      keywords: ['commerce', '[company]'],
      filtered: true,
      redacted: true,
    });
    expect(r.draft.pointers).toEqual([
      { commit: SHA, path: 'area:src.ts', lineStart: 1, lineEnd: 3, note: '[COMPANY] 소스' },
      { commit: SHA, path: 'change:2024-04.ts', lineStart: 1, lineEnd: 3, note: 'change:2024-04' },
    ]);
  });

  test('유효한 출처가 없으면 area 글 전부를 출처로, 입력을 잘랐으면 summaryOnly', async () => {
    const adapter = createScriptedAdapter(() =>
      JSON.stringify({ title: 't', summary: 's', keywords: [], sources: ['change:2024-03'] }),
    );
    // change:2024-03은 상한 3으로 잘려 목록에 없다 → 무효 → area 폴백
    const r = await analyzeOverview(adapter, {
      ...base(null),
      limits: { ...INDEX_LIMITS, overviewSources: 3 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.summaryOnly).toBe(true);
    expect(r.draft.pointers.map((p) => p.path)).toEqual(['area:docs.ts', 'area:src.ts']);
    expect(adapter.calls[0]!.prompt).toContain('입력 상한으로 일부만');
  });

  test('출처 글에 포인터가 없으면(비정상) MODEL_OUTPUT_INVALID', async () => {
    const adapter = createScriptedAdapter(() =>
      JSON.stringify({ title: 't', summary: 's', keywords: [], sources: [] }),
    );
    const r = await analyzeOverview(adapter, {
      ...base(),
      sources: [{ ...src('area:x', 'area', null), pointers: [] }],
    });
    expect(r).toMatchObject({ ok: false, code: 'MODEL_OUTPUT_INVALID' });
  });

  test('모델 호출이 던지면 MODEL_FAILED', async () => {
    const adapter = createScriptedAdapter(() => {
      throw new Error('429');
    });
    expect(await analyzeOverview(adapter, base())).toEqual({
      ok: false,
      code: 'MODEL_FAILED',
      errorName: 'Error',
    });
  });
});
