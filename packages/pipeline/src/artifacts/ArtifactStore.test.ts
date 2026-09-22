import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsArtifactStore } from './ArtifactStore.ts';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'galley-artifacts-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LocalFsArtifactStore', () => {
  test('DATA_DIR/artifacts/<슬러그>/<runId>/<파일>에 쓰고 읽고 지운다, 없으면 MISSING', async () => {
    const store = new LocalFsArtifactStore(dir);
    await store.write('무한-스크롤', 'run_1', 'velog.md', '# 본문\n');
    expect(store.pathFor('무한-스크롤', 'run_1', 'velog.md')).toBe(
      join(dir, 'artifacts', '무한-스크롤', 'run_1', 'velog.md'),
    );
    expect(await store.read('무한-스크롤', 'run_1', 'velog.md')).toEqual({
      ok: true,
      text: '# 본문\n',
    });
    await store.write('무한-스크롤', 'run_1', 'velog.md', '# 덮어씀\n');
    expect(await store.read('무한-스크롤', 'run_1', 'velog.md')).toEqual({
      ok: true,
      text: '# 덮어씀\n',
    });
    expect(await store.read('무한-스크롤', 'run_1', 'linkedin.md')).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
    await store.remove('무한-스크롤', 'run_1', 'velog.md');
    await store.remove('무한-스크롤', 'run_1', 'velog.md'); // 없어도 조용히
    expect(await store.read('무한-스크롤', 'run_1', 'velog.md')).toEqual({
      ok: false,
      code: 'ARTIFACT_MISSING',
    });
  });

  test('경로 조각에 구분자·..·NUL이 있으면 프로그래머 오류로 던진다(dataDir 밖을 가리킬 수 없다)', () => {
    const store = new LocalFsArtifactStore(dir);
    expect(() => store.pathFor('../x', 'run', 'a.md')).toThrow('topicSlug');
    expect(() => store.pathFor('s', 'a/b', 'a.md')).toThrow('runId');
    expect(() => store.pathFor('s', 'run', '..')).toThrow('name');
    expect(() => store.pathFor('s', 'run', 'a\0b')).toThrow('name');
  });
});
