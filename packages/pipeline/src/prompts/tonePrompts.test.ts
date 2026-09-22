import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import {
  hashPromptText,
  isTonePromptStep,
  loadTonePrompt,
  resolveTonePromptsDir,
  TONE_PROMPT_STEPS,
} from './tonePrompts.ts';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-prompts-'));
  await writeFile(join(dir, 'velog.md'), '# 벨로그 어투\n\n담백하게.\n');
  await writeFile(join(dir, 'linkedin.md'), '   \n\n');
  await mkdir(join(dir, 'zenn.md')); // 디렉터리 — 못 읽는다
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('hashPromptText', () => {
  test('같은 내용 → 같은 해시, 한 글자 바뀌면 다른 해시, sha256 hex 64자', () => {
    const a = hashPromptText('담백하게.');
    expect(a).toBe(hashPromptText('담백하게.'));
    expect(a).not.toBe(hashPromptText('담백하게!'));
    expect(a).not.toBe(hashPromptText('담백하게. '));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    // BOM·CRLF·끝 개행도 내용이다(결정 ③) — 파일 바이트가 다르면 다른 해시
    expect(hashPromptText('\uFEFFa')).not.toBe(hashPromptText('a'));
    expect(hashPromptText('a\r\n')).not.toBe(hashPromptText('a\n'));
    expect(hashPromptText('a\n')).not.toBe(hashPromptText('a'));
  });
});

describe('loadTonePrompt', () => {
  test('파일을 읽고 내용 그대로·해시를 준다', async () => {
    const r = await loadTonePrompt(dir, 'velog');
    expect(r).toEqual({
      ok: true,
      value: {
        step: 'velog',
        text: '# 벨로그 어투\n\n담백하게.\n',
        hash: hashPromptText('# 벨로그 어투\n\n담백하게.\n'),
      },
    });
  });

  test('없으면 PROMPT_NOT_FOUND, 공백뿐이면 PROMPT_EMPTY, 못 읽으면 PROMPT_UNREADABLE — 전부 값으로', async () => {
    expect(await loadTonePrompt(join(dir, 'none'), 'velog')).toEqual({
      ok: false,
      code: 'PROMPT_NOT_FOUND',
      step: 'velog',
    });
    expect(await loadTonePrompt(dir, 'linkedin')).toEqual({
      ok: false,
      code: 'PROMPT_EMPTY',
      step: 'linkedin',
    });
    expect(await loadTonePrompt(dir, 'zenn')).toEqual({
      ok: false,
      code: 'PROMPT_UNREADABLE',
      step: 'zenn',
    });
  });

  test('어투 단계는 velog·linkedin·zenn뿐, 폴더는 PROMPTS_DIR(절대경로만) 우선 아니면 리포 루트 .galley/prompts', () => {
    expect(TONE_PROMPT_STEPS).toEqual(['velog', 'linkedin', 'zenn']);
    expect(isTonePromptStep('verify')).toBe(false);
    expect(resolveTonePromptsDir({ PROMPTS_DIR: '/x/prompts' })).toEqual({
      ok: true,
      dir: '/x/prompts',
    });
    expect(resolveTonePromptsDir({ PROMPTS_DIR: './prompts' })).toEqual({
      ok: false,
      code: 'PROMPTS_DIR_NOT_ABSOLUTE',
      value: './prompts',
    });
    const fallback = resolveTonePromptsDir({ PROMPTS_DIR: '  ' });
    expect(fallback.ok && fallback.dir.endsWith(join('.galley', 'prompts'))).toBe(true);
    const none = resolveTonePromptsDir({});
    expect(none.ok && isAbsolute(none.dir) && none.dir.endsWith(join('.galley', 'prompts'))).toBe(
      true,
    );
  });
});
