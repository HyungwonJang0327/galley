import { describe, test, expect } from 'vitest';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  parseRedactConfig,
  loadRedactConfig,
  defaultRedactConfigPath,
  redact,
  type RedactConfig,
} from './redact.ts';

// 순서: 넓은 패턴(URL·이메일·키) → 회사명 literal. 반대로 두면 이메일 안의 회사명이 먼저 반쪽만 바뀐다.
const CONFIG: RedactConfig = {
  version: 1,
  rules: [
    {
      id: 'internal-url',
      kind: 'regex',
      pattern: 'https?://[\\w.-]+\\.example\\.internal[^\\s)]*',
      flags: 'i',
      replacement: '[INTERNAL_URL]',
    },
    {
      id: 'email',
      kind: 'regex',
      pattern: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+',
      replacement: '[EMAIL]',
    },
    { id: 'key', kind: 'regex', pattern: '\\b(?:sk|ghp)_[A-Za-z0-9]{8,}\\b', replacement: '[KEY]' },
    {
      id: 'company',
      kind: 'literal',
      values: ['Example Corp', 'Example', '예시상사'],
      replacement: '[COMPANY]',
    },
  ],
};

const lit = (id: string, values: string[], extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'literal',
  values,
  replacement: '[X]',
  ...extra,
});
const rx = (id: string, pattern: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'regex',
  pattern,
  replacement: '[X]',
  ...extra,
});
const cfg = (...rules: unknown[]) => ({ version: 1, rules });

describe('parseRedactConfig', () => {
  test('유효한 설정을 그대로 받아들인다(선택 필드는 없으면 생략)', () => {
    expect(parseRedactConfig(JSON.parse(JSON.stringify(CONFIG)))).toEqual({
      ok: true,
      config: CONFIG,
    });
  });

  test.each([
    ['루트가 배열', [], { reason: 'ROOT_NOT_OBJECT' }],
    ['루트가 문자열', 'x', { reason: 'ROOT_NOT_OBJECT' }],
    ['version 다름', { version: 2, rules: [] }, { reason: 'VERSION' }],
    ['rules 배열 아님', { version: 1, rules: {} }, { reason: 'RULES_NOT_ARRAY' }],
    ['규칙이 객체 아님', cfg('x'), { reason: 'RULE_NOT_OBJECT', index: 0 }],
    [
      'id 없음',
      cfg({ kind: 'literal', values: ['a'], replacement: 'x' }),
      { reason: 'RULE_ID', index: 0 },
    ],
    [
      'id 중복',
      cfg(lit('a', ['a']), lit('a', ['b'])),
      { reason: 'DUPLICATE_ID', ruleId: 'a', index: 1 },
    ],
    [
      'replacement 없음',
      cfg({ id: 'a', kind: 'literal', values: ['a'] }),
      { reason: 'REPLACEMENT', ruleId: 'a', index: 0 },
    ],
    [
      'literal values 비어 있음',
      cfg(lit('a', [])),
      { reason: 'LITERAL_VALUES', ruleId: 'a', index: 0 },
    ],
    [
      'literal values 공백',
      cfg(lit('a', [' '])),
      { reason: 'LITERAL_VALUES', ruleId: 'a', index: 0 },
    ],
    [
      'caseSensitive 타입',
      cfg(lit('a', ['a'], { caseSensitive: 'yes' })),
      { reason: 'CASE_SENSITIVE', ruleId: 'a', index: 0 },
    ],
    [
      'regex pattern 없음',
      cfg({ id: 'a', kind: 'regex', replacement: 'x' }),
      { reason: 'REGEX_PATTERN', ruleId: 'a', index: 0 },
    ],
    ['regex 깨짐', cfg(rx('a', '(')), { reason: 'REGEX_PATTERN', ruleId: 'a', index: 0 }],
    [
      '허용되지 않는 flag',
      cfg(rx('a', 'x', { flags: 'gy' })),
      { reason: 'REGEX_FLAGS', ruleId: 'a', index: 0 },
    ],
    [
      'flag 중복',
      cfg(rx('a', 'x', { flags: 'ii' })),
      { reason: 'REGEX_FLAGS', ruleId: 'a', index: 0 },
    ],
    [
      '빈 문자열에 매치되는 정규식 x*',
      cfg(rx('a', 'x*')),
      { reason: 'EMPTY_MATCH', ruleId: 'a', index: 0 },
    ],
    [
      '빈 문자열에 매치되는 정규식 \\b',
      cfg(rx('a', '\\b')),
      { reason: 'EMPTY_MATCH', ruleId: 'a', index: 0 },
    ],
    [
      'kind 모름',
      cfg({ id: 'a', kind: 'glob', replacement: 'x' }),
      { reason: 'KIND', ruleId: 'a', index: 0 },
    ],
    [
      '앞 규칙의 replacement가 뒤 literal에 잡힘',
      cfg({ ...rx('k', 'sk_\\w+'), replacement: '[KEY]' }, lit('company', ['key'])),
      { reason: 'REPLACEMENT_COLLISION', ruleId: 'k', index: 0 },
    ],
  ])('%s → REDACT_CONFIG_INVALID', (_name, json, where) => {
    expect(parseRedactConfig(json)).toEqual({ ok: false, code: 'REDACT_CONFIG_INVALID', ...where });
  });

  test('replacement 충돌은 뒤 규칙만 본다(앞 literal은 이미 적용된 뒤라 무해)', () => {
    expect(
      parseRedactConfig(
        cfg(lit('company', ['key']), { ...rx('k', 'sk_\\w+'), replacement: '[KEY]' }),
      ).ok,
    ).toBe(true);
  });
});

describe('loadRedactConfig', () => {
  test('없는 파일 MISSING · 디렉터리 UNREADABLE · 깨진 JSON INVALID(JSON) · 정상 ok, 실패 값에 경로가 없다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'galley-redact-'));
    try {
      const missing = await loadRedactConfig(join(dir, 'nope.json'));
      expect(missing).toEqual({ ok: false, code: 'REDACT_CONFIG_MISSING' });
      const unreadable = await loadRedactConfig(dir);
      expect(unreadable).toEqual({ ok: false, code: 'REDACT_CONFIG_UNREADABLE' });
      await writeFile(join(dir, 'bad.json'), '{ not json', 'utf8');
      const bad = await loadRedactConfig(join(dir, 'bad.json'));
      expect(bad).toEqual({ ok: false, code: 'REDACT_CONFIG_INVALID', reason: 'JSON' });
      for (const r of [missing, unreadable, bad]) expect(JSON.stringify(r)).not.toContain(dir);
      await writeFile(join(dir, 'ok.json'), JSON.stringify(CONFIG), 'utf8');
      expect(await loadRedactConfig(join(dir, 'ok.json'))).toEqual({ ok: true, config: CONFIG });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('기본 경로: REDACT_CONFIG_PATH가 있으면 그것, 없으면 리포 루트 .galley/redact.json', () => {
    expect(defaultRedactConfigPath({ REDACT_CONFIG_PATH: '/x/redact.json' })).toBe(
      '/x/redact.json',
    );
    expect(
      defaultRedactConfigPath({ REDACT_CONFIG_PATH: '  ' }).endsWith(
        join('.galley', 'redact.json'),
      ),
    ).toBe(true);
    expect(defaultRedactConfigPath({}).endsWith(join('.galley', 'redact.json'))).toBe(true);
  });

  test('예시 파일(.galley/redact.example.json)은 유효하고 다섯 종류(URL·도메인·이메일·키·회사명)를 전부 가린다', async () => {
    const example = defaultRedactConfigPath({}).replace(/redact\.json$/, 'redact.example.json');
    expect(existsSync(example)).toBe(true);
    const loaded = await loadRedactConfig(example);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const raw = JSON.parse(await readFile(example, 'utf8')) as { rules: { id: string }[] };
    expect(raw.rules.at(-1)?.id).toBe('company'); // 회사명은 마지막
    const r = redact(
      'Example Corp 팀(dev@example.com)이 https://git.example.internal/x 와 api.example.internal 에 sk_abcdefghij12 AKIA0189018901890189 로 접속. 공개 사이트 example.com. skyscrapers는 그대로.',
      loaded.config,
    );
    expect(r.text).toBe(
      '[COMPANY] 팀([EMAIL])이 [INTERNAL_URL] 와 [INTERNAL_DOMAIN] 에 [KEY] [KEY] 로 접속. 공개 사이트 [COMPANY_DOMAIN]. skyscrapers는 그대로.',
    );
    expect(r.text).not.toMatch(/example/i);
  });
});

describe('redact', () => {
  test('회사명은 대소문자 무시로, 긴 값부터 치환한다', () => {
    const r = redact('Example Corp와 example, EXAMPLE CORP 그리고 예시상사', CONFIG);
    expect(r.text).toBe('[COMPANY]와 [COMPANY], [COMPANY] 그리고 [COMPANY]');
    expect(r.redacted).toBe(true);
    expect(r.hits).toEqual([{ ruleId: 'company', count: 4 }]);
  });

  test('정규식 규칙: 내부 URL·이메일·키를 잡고 규칙별 적중 수를 낸다', () => {
    const r = redact(
      '문의 dev@example.internal 또는 https://git.example.internal/repo/a?x=1 · 토큰 sk_abcdefgh12345 · 무관 https://github.com/x',
      CONFIG,
    );
    expect(r.text).toBe(
      '문의 [EMAIL] 또는 [INTERNAL_URL] · 토큰 [KEY] · 무관 https://github.com/x',
    );
    expect(r.hits).toEqual([
      { ruleId: 'internal-url', count: 1 },
      { ruleId: 'email', count: 1 },
      { ruleId: 'key', count: 1 },
    ]);
    // 회사명 literal이 뒤에 있어 이메일·URL 안의 "example"은 이미 통째로 가려진 뒤라 건드리지 않는다
    expect(r.hits.find((h) => h.ruleId === 'company')).toBeUndefined();
  });

  test('순서를 반대로 두면 이메일 안의 회사명이 먼저 반쪽만 바뀐다(설정 파일이 순서를 책임진다)', () => {
    const reversed: RedactConfig = { version: 1, rules: [...CONFIG.rules].reverse() };
    expect(redact('dev@example.internal', reversed).text).toBe('dev@[COMPANY].internal');
  });

  test('적중이 없거나 규칙·입력이 비었으면 text 그대로, redacted=false, hits 빈 배열', () => {
    expect(redact('평범한 문장입니다.', CONFIG)).toEqual({
      text: '평범한 문장입니다.',
      redacted: false,
      hits: [],
    });
    expect(redact('Example', { version: 1, rules: [] })).toEqual({
      text: 'Example',
      redacted: false,
      hits: [],
    });
    expect(redact('', CONFIG)).toEqual({ text: '', redacted: false, hits: [] });
  });

  test('멱등 — 한 번 가린 결과에 다시 적용해도 같다', () => {
    const once = redact('Example Corp dev@example.internal sk_abcdefgh12345', CONFIG);
    const twice = redact(once.text, CONFIG);
    expect(twice.text).toBe(once.text);
    expect(twice.redacted).toBe(false);
  });

  test('caseSensitive=true는 대소문자를 구분하고 false 명시는 무시하며, 정규식 특수문자·-·]·\\는 이스케이프된다', () => {
    const strict: RedactConfig = {
      version: 1,
      rules: [
        {
          id: 'exact',
          kind: 'literal',
          values: ['Acme (KR)'],
          replacement: '[X]',
          caseSensitive: true,
        },
      ],
    };
    expect(redact('Acme (KR) acme (kr)', strict).text).toBe('[X] acme (kr)');
    const loose: RedactConfig = {
      version: 1,
      rules: [
        {
          id: 'l',
          kind: 'literal',
          values: ['a-b]c\\d'],
          replacement: '[X]',
          caseSensitive: false,
        },
      ],
    };
    expect(redact('A-B]C\\D 와 abcd', loose).text).toBe('[X] 와 abcd');
  });

  test('u 플래그 규칙과 빈 매치 방어(parse를 우회한 설정도 텍스트를 파괴하지 않는다)', () => {
    const unicode: RedactConfig = {
      version: 1,
      rules: [
        {
          id: 'u',
          kind: 'regex',
          pattern: '\\p{Script=Hangul}+상사',
          flags: 'u',
          replacement: '[COMPANY]',
        },
      ],
    };
    expect(redact('예시상사 와 Example', unicode).text).toBe('[COMPANY] 와 Example');
    const empty: RedactConfig = {
      version: 1,
      rules: [{ id: 'e', kind: 'regex', pattern: 'x*', replacement: '[X]' }],
    };
    expect(redact('abc', empty)).toEqual({ text: 'abc', redacted: false, hits: [] });
  });

  test('입력 문자열을 변경하지 않는다(순수)', () => {
    const input = 'Example Corp';
    redact(input, CONFIG);
    expect(input).toBe('Example Corp');
  });
});
