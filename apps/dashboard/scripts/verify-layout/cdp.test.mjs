// @vitest-environment node
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeDir } from './cdp.mjs';

describe('removeDir', () => {
  const created = [];
  afterEach(() => {
    for (const dir of created.splice(0)) {
      try {
        chmodSync(join(dir, 'locked'), 0o755);
      } catch {
        // 잠근 하위 폴더가 없는 케이스
      }
      rmSync(dir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('보통 폴더는 통째로 지운다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'galley-removedir-'));
    created.push(dir);
    mkdirSync(join(dir, 'Default'));
    writeFileSync(join(dir, 'Default', 'file'), '');

    removeDir(dir);

    expect(existsSync(dir)).toBe(false);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    '지울 수 없는 폴더여도 던지지 않고 경고만 남긴다 (정리 실패가 실측 결과를 가리지 않게)',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'galley-removedir-'));
      created.push(dir);
      mkdirSync(join(dir, 'locked'));
      writeFileSync(join(dir, 'locked', 'file'), '');
      chmodSync(join(dir, 'locked'), 0o555); // 하위 파일 unlink 불가 → rm이 EACCES/EPERM
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => removeDir(dir)).not.toThrow();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(dir);
    },
  );
});
