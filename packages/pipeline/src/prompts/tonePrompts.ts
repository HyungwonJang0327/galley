// 어투 프롬프트 로더 — `.galley/prompts/{velog,linkedin,zenn}.md`(리포 루트, `.galley/redact.json`과 같은 자리)를 읽고
// 내용의 sha256을 돌려준다(decisions/tone-prompts.md). 읽는 주체는 StepRunner(단계 구현)이고 워커는 해시를 기록만 한다.
// 파일이 없으면 값으로 실패(재시도 불가 — 파일을 만들어야 풀린다). 기본 어투를 코드에 두지 않는다.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 어투 프롬프트가 있는 단계 — 모델이 글을 쓰는 세 단계뿐. */
export const TONE_PROMPT_STEPS = ['velog', 'linkedin', 'zenn'] as const;
export type TonePromptStep = (typeof TONE_PROMPT_STEPS)[number];
export const isTonePromptStep = (value: string): value is TonePromptStep =>
  (TONE_PROMPT_STEPS as readonly string[]).includes(value);

export interface TonePrompt {
  step: TonePromptStep;
  /** 파일 내용 그대로(앞뒤 공백 포함 — 해시와 같은 바이트). */
  text: string;
  /** 내용 sha256(hex, 64자). RunStep.promptHash. */
  hash: string;
}

export type TonePromptFailure =
  /** 파일이 없다 — 재시도 불가, 파일을 만들어야 한다. */
  | { ok: false; code: 'PROMPT_NOT_FOUND'; step: TonePromptStep }
  /** 권한·디렉터리 등으로 못 읽었다. */
  | { ok: false; code: 'PROMPT_UNREADABLE'; step: TonePromptStep }
  /** 비어 있다(공백뿐) — 어투 없이 글을 쓰지 않는다. */
  | { ok: false; code: 'PROMPT_EMPTY'; step: TonePromptStep };
export type TonePromptResult = { ok: true; value: TonePrompt } | TonePromptFailure;

/** 내용 해시 — 같은 내용이면 같은 값, 한 글자만 달라도 다른 값. UTF-8 바이트 기준. */
export const hashPromptText = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export const tonePromptPath = (promptsDir: string, step: TonePromptStep): string =>
  join(promptsDir, `${step}.md`);

export async function loadTonePrompt(
  promptsDir: string,
  step: TonePromptStep,
): Promise<TonePromptResult> {
  let text: string;
  try {
    text = await readFile(tonePromptPath(promptsDir, step), 'utf8');
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    return { ok: false, code: code === 'ENOENT' ? 'PROMPT_NOT_FOUND' : 'PROMPT_UNREADABLE', step };
  }
  if (text.trim() === '') return { ok: false, code: 'PROMPT_EMPTY', step };
  return { ok: true, value: { step, text, hash: hashPromptText(text) } };
}

/**
 * 기본 폴더. `.env`의 `PROMPTS_DIR`이 있으면 그것(다른 경로들과 같은 규칙 — 주입), 없으면 리포 루트 `.galley/prompts`
 * (이 파일 위치에서 파생 — 소스 트리 전용 폴백, redact.ts `defaultRedactConfigPath`와 같은 방식).
 */
export function defaultTonePromptsDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env['PROMPTS_DIR'];
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv;
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', '..', '.galley', 'prompts');
}
