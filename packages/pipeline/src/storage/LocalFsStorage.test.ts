import { describe, test, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsStorage } from './LocalFsStorage.ts';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'galley-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('LocalFsStorage', () => {
  test('blogDir의 주제_큐.md를 읽는다', async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, '주제_큐.md'), '# 큐\n', 'utf8');
      const storage = new LocalFsStorage(dir);
      expect(await storage.readQueueFile()).toBe('# 큐\n');
    });
  });

  test('주제_큐.md에 재작성한다', async () => {
    await withTempDir(async (dir) => {
      const storage = new LocalFsStorage(dir);
      await storage.writeQueueFile('## 대기\n');
      expect(await readFile(join(dir, '주제_큐.md'), 'utf8')).toBe('## 대기\n');
    });
  });

  test('쓰고 나면 임시 파일이 남지 않는다(임시 파일 + rename)', async () => {
    await withTempDir(async (dir) => {
      const storage = new LocalFsStorage(dir);
      await storage.writeQueueFile('## 대기\n\n- A\n');
      expect(await readdir(dir)).toEqual(['주제_큐.md']);
    });
  });

  test('덮어쓰면 이전 내용이 남지 않는다', async () => {
    await withTempDir(async (dir) => {
      const storage = new LocalFsStorage(dir);
      await storage.writeQueueFile('긴 첫 내용');
      await storage.writeQueueFile('짧게');
      expect(await readFile(join(dir, '주제_큐.md'), 'utf8')).toBe('짧게');
    });
  });
});
