import { describe, test, expect } from 'vitest';
import type { RedactConfig } from '../evidence/redact.ts';
import { redactStepContext } from './redactContext.ts';
import type { StepContext } from './StepRunner.ts';

const CONFIG: RedactConfig = {
  version: 1,
  rules: [
    { id: 'company', kind: 'literal', values: ['Example Corp'], replacement: '[COMPANY]' },
    {
      id: 'domain',
      kind: 'regex',
      pattern: '\\bexample\\.com\\b',
      flags: 'i',
      replacement: '[DOMAIN]',
    },
  ],
};

const ctx = (over: Partial<StepContext> = {}): StepContext => ({
  runId: 'r1',
  step: 'velog',
  topic: { id: 't1', title: 'Example Corp 결제 전환기', slug: 'example-corp-결제-전환기' },
  modelId: 'mock',
  sources: {},
  signal: new AbortController().signal,
  series: {
    name: 'Example Corp 이야기',
    nameJa: 'Example Corp 物語',
    episodeNo: 2,
    total: 3,
    previous: { title: '1편: example.com 소개', url: 'https://velog.io/@x/example.com' },
    next: { title: '3편 (Example Corp)' },
    alreadyPublished: false,
  },
  ...over,
});

describe('redactStepContext', () => {
  test('제목·시리즈명·일본어명·이전/다음 편 제목만 걸러지고 slug·id·URL·그 밖은 그대로, 입력은 불변', () => {
    const input = ctx();
    const { ctx: out, redacted, hits } = redactStepContext(input, CONFIG);
    expect(redacted).toBe(true);
    expect(out.topic).toEqual({
      id: 't1',
      title: '[COMPANY] 결제 전환기',
      slug: 'example-corp-결제-전환기',
    });
    expect(out.series).toEqual({
      name: '[COMPANY] 이야기',
      nameJa: '[COMPANY] 物語',
      episodeNo: 2,
      total: 3,
      previous: { title: '1편: [DOMAIN] 소개', url: 'https://velog.io/@x/example.com' },
      next: { title: '3편 ([COMPANY])' },
      alreadyPublished: false,
    });
    // 같은 규칙의 적중은 필드를 건너 합산된다
    expect(hits).toEqual([
      { ruleId: 'company', count: 4 },
      { ruleId: 'domain', count: 1 },
    ]);
    expect(out.runId).toBe('r1');
    expect(out.signal).toBe(input.signal);
    expect(input.topic.title).toBe('Example Corp 결제 전환기');
    expect(input.series?.name).toBe('Example Corp 이야기');
  });

  test('설정이 없으면 같은 객체를 그대로, 시리즈가 없으면 series 키를 만들지 않는다', () => {
    const input = ctx();
    expect(redactStepContext(input, null)).toEqual({ ctx: input, redacted: false, hits: [] });
    expect(redactStepContext(input, null).ctx).toBe(input);

    const plain = ctx({ series: undefined });
    delete (plain as { series?: unknown }).series;
    const out = redactStepContext(plain, CONFIG).ctx;
    expect('series' in out).toBe(false);
    expect(out.topic.title).toBe('[COMPANY] 결제 전환기');
  });

  test('적중이 없으면 redacted=false, 글자는 그대로', () => {
    const input = ctx({
      topic: { id: 't1', title: '무한 스크롤', slug: 's' },
      series: undefined,
    });
    const r = redactStepContext(input, CONFIG);
    expect(r.redacted).toBe(false);
    expect(r.hits).toEqual([]);
    expect(r.ctx.topic.title).toBe('무한 스크롤');
  });
});
