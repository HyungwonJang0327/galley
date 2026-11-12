// @vitest-environment node
// happy-dom에서는 import.meta.url이 file: 스킴이 아니라 파일을 읽지 못한다 — 이 테스트만 node 환경.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 토큰은 CSS 변수라 타입이 지키지 못한다 — 글꼴 토큰 둘이 있고 generic 패밀리로 끝나는지만 고정한다.
const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
const declaration = (name: string): string | undefined =>
  new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.replace(/\s+/g, ' ').trim();

describe('타이포 토큰', () => {
  it('--ui-font-sans는 sans-serif로, --ui-font-mono는 monospace로 끝난다(generic 폴백)', () => {
    expect(declaration('--ui-font-sans')).toMatch(/sans-serif$/);
    expect(declaration('--ui-font-mono')).toMatch(/monospace$/);
    // 시스템 고정폭을 먼저 — 코드 미리보기가 OS 기본 고정폭을 따라간다
    expect(declaration('--ui-font-mono')).toMatch(/^ui-monospace,/);
  });
});
