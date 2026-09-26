// B3c 산출물 구조 테스트 — 임시 blog 폴더에 실제로 쓰고 이름·내용·임시 파일 잔여를 본다.
import { describe, test, expect } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFsPostsWriter, type PostFiles } from './PostsWriter.ts';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'galley-posts-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const FILES: PostFiles = {
  velog: '# 무한 스크롤\n\n본문\n',
  linkedin: '링크드인\n',
  zenn: '---\ntitle: "x"\n---\n\n本文\n',
  publishInfo: '# 발행 정보 — 무한 스크롤\n',
  evidence: '{"items":[]}\n',
  verification: '{"claims":[]}\n',
};

const EXPECTED = [
  '무한_스크롤.md',
  '무한_스크롤_링크드인.md',
  '무한_스크롤_zenn.md',
  '무한_스크롤_발행정보.md',
  'evidence.json',
  'verification.json',
];

describe('LocalFsPostsWriter', () => {
  test('posts/<슬러그>/에 6개 파일(썸네일은 B3b)을 쓰고 임시 파일을 남기지 않는다', async () => {
    await withTempDir(async (blogDir) => {
      const writer = new LocalFsPostsWriter(blogDir);

      const result = await writer.write({
        slug: 'infinite-scroll',
        articleTitle: '무한 스크롤',
        files: FILES,
        overwrite: false,
      });

      const dir = join(blogDir, 'posts', 'infinite-scroll');
      expect(result).toEqual({ ok: true, dir, files: EXPECTED });
      expect((await readdir(dir)).sort()).toEqual([...EXPECTED].sort());
      expect(await readFile(join(dir, '무한_스크롤.md'), 'utf8')).toBe(FILES.velog);
      expect(await readFile(join(dir, 'evidence.json'), 'utf8')).toBe(FILES.evidence);
    });
  });

  test('폴더가 이미 있으면 overwrite가 아닐 때 POSTS_DIR_EXISTS — 아무것도 쓰지 않는다', async () => {
    await withTempDir(async (blogDir) => {
      const dir = join(blogDir, 'posts', 'taken');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, '사람이_쓴_글.md'), '손으로\n');
      const writer = new LocalFsPostsWriter(blogDir);

      const result = await writer.write({
        slug: 'taken',
        articleTitle: '제목',
        files: FILES,
        overwrite: false,
      });

      expect(result).toEqual({ ok: false, code: 'POSTS_DIR_EXISTS', dir });
      expect(await readdir(dir)).toEqual(['사람이_쓴_글.md']);
    });
  });

  test('overwrite면 같은 이름을 덮어쓰고 다른 파일은 건드리지 않는다', async () => {
    await withTempDir(async (blogDir) => {
      const writer = new LocalFsPostsWriter(blogDir);
      const first = { slug: 's', articleTitle: '제목', files: FILES, overwrite: false };
      await writer.write(first);
      const dir = join(blogDir, 'posts', 's');
      await writeFile(join(dir, 'illust1.png'), 'png');

      const result = await writer.write({
        ...first,
        files: { ...FILES, velog: '# 제목\n\n고친 본문\n' },
        overwrite: true,
      });

      expect(result.ok).toBe(true);
      expect(await readFile(join(dir, '제목.md'), 'utf8')).toBe('# 제목\n\n고친 본문\n');
      expect(await readdir(dir)).toContain('illust1.png');
    });
  });

  test('blog 폴더가 쓸 수 없으면 POSTS_WRITE_FAILED(값)', async () => {
    await withTempDir(async (blogDir) => {
      // posts 자리에 파일을 두면 그 아래 폴더를 만들 수 없다.
      await writeFile(join(blogDir, 'posts'), 'not a dir');
      const writer = new LocalFsPostsWriter(blogDir);

      const result = await writer.write({
        slug: 'x',
        articleTitle: '제목',
        files: FILES,
        overwrite: false,
      });

      expect(result).toMatchObject({ ok: false, code: 'POSTS_WRITE_FAILED' });
    });
  });

  test('슬러그에 구분자·..이 있으면 프로그래머 오류로 던진다', async () => {
    await withTempDir(async (blogDir) => {
      const writer = new LocalFsPostsWriter(blogDir);
      for (const slug of ['../out', 'a/b', '..', '']) {
        await expect(
          writer.write({ slug, articleTitle: '제목', files: FILES, overwrite: true }),
        ).rejects.toThrow('프로그래머 오류');
      }
    });
  });
});
