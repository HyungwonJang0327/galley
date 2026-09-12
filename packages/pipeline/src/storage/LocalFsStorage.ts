import { readFile, rename, writeFile } from 'node:fs/promises';
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

  /**
   * 임시 파일에 쓴 뒤 rename으로 바꿔 끼운다(원자적). 사용자가 에디터로 같은 파일을 열어 둘 수
   * 있어서, 쓰다 만 내용이 보이거나 중간에 끊겨 파일이 잘리는 일이 없어야 한다.
   * 임시 파일은 같은 폴더에 둔다 — 다른 파일시스템이면 rename이 원자적이지 않다.
   */
  async writeQueueFile(content: string): Promise<void> {
    const temp = `${this.queuePath}.${process.pid}.tmp`;
    await writeFile(temp, content, 'utf8');
    await rename(temp, this.queuePath);
  }
}
