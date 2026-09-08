import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Storage } from './Storage';

const QUEUE_FILENAME = '주제_큐.md';

// BLOG_DIR 아래 파일을 읽고 쓰는 Storage 구현. blogDir는 주입(env는 호출부에서 전달).
export class LocalFsStorage implements Storage {
  constructor(private readonly blogDir: string) {}

  private get queuePath(): string {
    return join(this.blogDir, QUEUE_FILENAME);
  }

  readQueueFile(): Promise<string> {
    return readFile(this.queuePath, 'utf8');
  }

  async writeQueueFile(content: string): Promise<void> {
    await writeFile(this.queuePath, content, 'utf8');
  }
}
